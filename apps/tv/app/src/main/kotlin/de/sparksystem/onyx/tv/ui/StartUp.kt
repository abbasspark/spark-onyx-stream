// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui

import android.os.Build
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.sparksystem.onyx.tv.Container
import de.sparksystem.onyx.tv.data.Answer
import de.sparksystem.onyx.tv.data.DeviceCodeStart
import de.sparksystem.onyx.tv.data.Profile
import de.sparksystem.onyx.tv.ui.theme.Onyx
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Where the app is before anything can be watched. */
sealed interface Step {
    /** Reading what was stored, and asking the server whether it will talk to us. */
    data object Starting : Step

    /** No server address yet, or the one we have does not answer. */
    data class NeedsServer(val trouble: String? = null, val busy: Boolean = false) : Step

    /** This version of the app is older than the installation allows. */
    data class TooOld(val message: String, val updateUrl: String?) : Step

    /** Showing a code and waiting for the viewer to approve it on a phone. */
    data class SigningIn(
        val code: DeviceCodeStart? = null,
        val trouble: String? = null,
    ) : Step

    data class ChoosingProfile(
        val profiles: List<Profile> = emptyList(),
        val asking: Profile? = null,
        val trouble: String? = null,
    ) : Step

    /** Signed in, with a profile: the catalog can be shown. */
    data object Ready : Step
}

data class StartUpState(
    val step: Step = Step.Starting,
    val siteName: String = "Onyx",
    val accent: Color = Onyx.sard,
    /** What the settings screen says about this television. */
    val serverUrl: String? = null,
    val viewerName: String? = null,
    val profileName: String? = null,
)

/**
 * Everything between switching the television on and seeing the catalog:
 * which server, who is watching, and whether this app is still welcome.
 *
 * It is one object because the steps run into each other. A token that stops
 * working takes the app back to the code screen, and an operator who moves
 * their service takes it back to the address, and both of those are the same
 * screen flow seen from different places.
 */
class StartUpModel(private val container: Container) : ViewModel() {

    private val state = MutableStateFlow(StartUpState())
    val flow: StateFlow<StartUpState> = state.asStateFlow()

    private var polling: Job? = null

    init {
        viewModelScope.launch { begin() }
    }

    private suspend fun begin() {
        val session = container.session.load()
        state.update {
            it.copy(
                siteName = session.siteName ?: it.siteName,
                accent = parseAccent(session.accent),
                serverUrl = session.serverUrl,
                viewerName = session.viewerName,
                profileName = session.profileName,
            )
        }
        if (!session.hasServer) {
            state.update { it.copy(step = Step.NeedsServer()) }
            return
        }
        when (val meta = container.api.meta()) {
            is Answer.TooOld -> {
                state.update { it.copy(step = Step.TooOld(meta.message, meta.updateUrl)) }
                return
            }
            is Answer.Unreachable -> {
                state.update {
                    it.copy(
                        step = Step.NeedsServer(
                            "That service could not be reached. Check the address, " +
                                "and that this television is on the network.",
                        ),
                    )
                }
                return
            }
            is Answer.Refused -> {
                state.update {
                    it.copy(step = Step.NeedsServer("That address did not answer as a service."))
                }
                return
            }
            is Answer.Ok -> {
                val refusal = meta.value.client?.takeIf { !it.supported }?.refusal
                if (refusal != null) {
                    state.update {
                        it.copy(
                            step = Step.TooOld(
                                refusal.message ?: "This version of the app is no longer supported.",
                                refusal.updateUrl,
                            ),
                        )
                    }
                    return
                }
            }
        }

        // The name and the colour of the service, so that the app wears them
        // from the first screen rather than after signing in.
        (container.api.site() as? Answer.Ok)?.value?.let { site ->
            val accent = site.accent?.color
            container.session.setSite(site.name, accent)
            state.update {
                it.copy(
                    siteName = site.name.ifBlank { it.siteName },
                    accent = parseAccent(accent),
                )
            }
        }

        if (!session.signedIn) {
            startSigningIn()
            return
        }
        if (!session.hasProfile) {
            loadProfiles()
            return
        }
        state.update { it.copy(step = Step.Ready) }
    }

    // --- The address ------------------------------------------------------------

    fun connectTo(address: String) {
        val url = container.api.addressOf(address)
        if (url == null) {
            state.update {
                it.copy(step = Step.NeedsServer("That does not look like an address."))
            }
            return
        }
        viewModelScope.launch {
            state.update { it.copy(step = Step.NeedsServer(busy = true)) }
            container.session.setServer(url.toString())
            begin()
        }
    }

    fun changeServer() {
        polling?.cancel()
        state.update { it.copy(step = Step.NeedsServer()) }
    }

    // --- Signing in --------------------------------------------------------------

    fun startSigningIn() {
        polling?.cancel()
        state.update { it.copy(step = Step.SigningIn()) }
        polling = viewModelScope.launch {
            when (val started = container.api.startDeviceCode(deviceName(), Build.MODEL)) {
                is Answer.Ok -> {
                    state.update { it.copy(step = Step.SigningIn(code = started.value)) }
                    waitForApproval(started.value)
                }
                is Answer.TooOld ->
                    state.update { it.copy(step = Step.TooOld(started.message, started.updateUrl)) }
                is Answer.Unreachable ->
                    state.update {
                        it.copy(step = Step.SigningIn(trouble = "The service could not be reached."))
                    }
                is Answer.Refused ->
                    state.update { it.copy(step = Step.SigningIn(trouble = started.message)) }
            }
        }
    }

    /**
     * Asks, at the pace the server set, whether the viewer has answered yet.
     * The server decides how often, so a crowd of televisions cannot push it
     * over by asking faster.
     */
    private suspend fun waitForApproval(code: DeviceCodeStart) {
        val every = code.interval.coerceAtLeast(2) * 1000L
        val until = System.currentTimeMillis() + code.expiresIn * 1000L
        while (System.currentTimeMillis() < until) {
            delay(every)
            when (val poll = container.api.pollDeviceCode(code.deviceCode)) {
                is Answer.Ok -> {
                    val answer = poll.value
                    when (answer.status) {
                        "approved" -> {
                            val token = answer.token ?: continue
                            container.session.signIn(token, answer.viewer?.name)
                            val profile = answer.profile
                            if (!answer.chooseProfile && profile != null) {
                                container.session.setProfile(profile.id, profile.name)
                                state.update {
                                    it.copy(
                                        step = Step.Ready,
                                        viewerName = answer.viewer?.name ?: it.viewerName,
                                        profileName = profile.name,
                                    )
                                }
                            } else {
                                loadProfiles()
                            }
                            return
                        }
                        "denied" -> {
                            state.update {
                                it.copy(
                                    step = Step.SigningIn(
                                        trouble = "That was turned down. Get a new code to try again.",
                                    ),
                                )
                            }
                            return
                        }
                        "expired" -> {
                            // A code that ran out is replaced without being asked:
                            // the viewer is standing there with a phone in hand.
                            startSigningIn()
                            return
                        }
                    }
                }
                is Answer.TooOld -> {
                    state.update { it.copy(step = Step.TooOld(poll.message, poll.updateUrl)) }
                    return
                }
                // A moment without a network is not worth a screen of its own
                // while a code is up. The next ask may well work.
                is Answer.Unreachable -> Unit
                is Answer.Refused -> {
                    state.update { it.copy(step = Step.SigningIn(code = code, trouble = poll.message)) }
                    return
                }
            }
        }
        startSigningIn()
    }

    // --- Profiles ------------------------------------------------------------------

    /** Back to the profile picker, from the settings screen. */
    fun changeProfile() {
        viewModelScope.launch {
            container.session.forgetProfile()
            state.update { it.copy(step = Step.ChoosingProfile()) }
            loadProfiles()
        }
    }

    /** The television is handed on: it forgets the service as well as the viewer. */
    fun forgetService() {
        viewModelScope.launch {
            container.session.forgetEverything()
            state.update { StartUpState(step = Step.NeedsServer()) }
        }
    }

    private suspend fun loadProfiles() {
        when (val answer = container.api.profiles()) {
            is Answer.Ok -> {
                val profiles = answer.value.profiles
                if (profiles.size == 1 && !profiles[0].hasPin) {
                    // One profile without a PIN is not a question worth asking.
                    choose(profiles[0])
                    return
                }
                state.update { it.copy(step = Step.ChoosingProfile(profiles = profiles)) }
            }
            is Answer.TooOld ->
                state.update { it.copy(step = Step.TooOld(answer.message, answer.updateUrl)) }
            is Answer.Refused ->
                if (answer.status == 401) startSigningIn()
                else state.update { it.copy(step = Step.ChoosingProfile(trouble = answer.message)) }
            is Answer.Unreachable ->
                state.update {
                    it.copy(step = Step.ChoosingProfile(trouble = "The service could not be reached."))
                }
        }
    }

    fun choose(profile: Profile) {
        if (profile.hasPin) {
            state.update { current ->
                val step = current.step as? Step.ChoosingProfile ?: Step.ChoosingProfile()
                current.copy(step = step.copy(asking = profile, trouble = null))
            }
            return
        }
        select(profile, null)
    }

    fun submitPin(profile: Profile, pin: String) = select(profile, pin)

    fun cancelPin() {
        state.update { current ->
            val step = current.step as? Step.ChoosingProfile ?: return@update current
            current.copy(step = step.copy(asking = null, trouble = null))
        }
    }

    private fun select(profile: Profile, pin: String?) {
        viewModelScope.launch {
            when (val answer = container.api.selectProfile(profile.id, pin)) {
                is Answer.Ok -> {
                    container.session.setProfile(profile.id, profile.name)
                    state.update { it.copy(step = Step.Ready, profileName = profile.name) }
                }
                is Answer.Refused -> state.update { current ->
                    val step = current.step as? Step.ChoosingProfile ?: Step.ChoosingProfile()
                    current.copy(step = step.copy(trouble = answer.message))
                }
                is Answer.TooOld ->
                    state.update { it.copy(step = Step.TooOld(answer.message, answer.updateUrl)) }
                is Answer.Unreachable -> state.update { current ->
                    val step = current.step as? Step.ChoosingProfile ?: Step.ChoosingProfile()
                    current.copy(step = step.copy(trouble = "The service could not be reached."))
                }
            }
        }
    }

    /** Back to the code screen, when a token stopped working while watching. */
    fun signedOut() {
        viewModelScope.launch {
            container.session.signOut()
            startSigningIn()
        }
    }

    private fun deviceName(): String {
        val maker = Build.MANUFACTURER.replaceFirstChar(Char::uppercase)
        val model = Build.MODEL.orEmpty()
        return when {
            model.startsWith(maker, ignoreCase = true) -> model
            model.isBlank() -> "$maker television"
            else -> "$maker $model"
        }.take(60)
    }
}

/** "#e6a85c" as a colour, or the one the app ships with. */
fun parseAccent(value: String?): Color {
    val hex = value?.trim()?.removePrefix("#")?.takeIf { it.length == 6 } ?: return Onyx.sard
    val number = hex.toLongOrNull(16) ?: return Onyx.sard
    return Color(0xFF000000 or number)
}
