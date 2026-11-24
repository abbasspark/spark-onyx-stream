// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import de.sparksystem.onyx.tv.ui.CatalogModel
import de.sparksystem.onyx.tv.ui.PlayingModel
import de.sparksystem.onyx.tv.ui.StartUpModel
import de.sparksystem.onyx.tv.ui.Step
import de.sparksystem.onyx.tv.ui.components.AccentButton
import de.sparksystem.onyx.tv.ui.components.Page
import de.sparksystem.onyx.tv.ui.components.Waiting
import de.sparksystem.onyx.tv.ui.screens.HomeScreen
import de.sparksystem.onyx.tv.ui.screens.PlayerScreen
import de.sparksystem.onyx.tv.ui.screens.ProfilesScreen
import de.sparksystem.onyx.tv.ui.screens.ServerScreen
import de.sparksystem.onyx.tv.ui.screens.SignInScreen
import de.sparksystem.onyx.tv.ui.screens.TitleScreen
import de.sparksystem.onyx.tv.ui.theme.OnyxTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as OnyxApp).container
        setContent { App(container) }
    }
}

/** Builds the models of this app, which all take the one container. */
private class Models(private val container: Container) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = when {
        modelClass.isAssignableFrom(StartUpModel::class.java) -> StartUpModel(container) as T
        modelClass.isAssignableFrom(CatalogModel::class.java) -> CatalogModel(container) as T
        modelClass.isAssignableFrom(PlayingModel::class.java) -> PlayingModel(container) as T
        else -> throw IllegalArgumentException("No model for ${modelClass.name}")
    }
}

/**
 * Where the app is. Three places, and the remote's back key walks out of
 * them in the order a viewer expects: out of the player to the title, out of
 * the title to the home page, out of the home page to the launcher.
 */
private sealed interface Where {
    data object Home : Where
    data class Title(val slug: String) : Where
    data class Playing(val titleSlug: String) : Where
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun App(container: Container) {
    val models = remember { Models(container) }
    val startUp: StartUpModel = viewModel(factory = models)
    val state by startUp.flow.collectAsStateWithLifecycle()

    OnyxTheme(accent = state.accent) {
        Surface(modifier = Modifier.fillMaxSize()) {
            when (val step = state.step) {
                is Step.Starting -> Waiting("Starting")

                is Step.NeedsServer -> ServerScreen(
                    trouble = step.trouble,
                    busy = step.busy,
                    onConnect = startUp::connectTo,
                )

                is Step.TooOld -> Page(
                    heading = "Time to update",
                    note = step.message + (step.updateUrl?.let { "\n\n$it" } ?: ""),
                )

                is Step.SigningIn -> SignInScreen(
                    siteName = state.siteName,
                    userCode = step.code?.userCode,
                    verificationUrl = step.code?.verificationUrl,
                    qrUrl = step.code?.verificationUrlComplete?.takeIf { it.isNotBlank() }
                        ?: step.code?.verificationUrl,
                    trouble = step.trouble,
                    onRetry = startUp::startSigningIn,
                    onChangeServer = startUp::changeServer,
                )

                is Step.ChoosingProfile -> ProfilesScreen(
                    profiles = step.profiles,
                    asking = step.asking,
                    trouble = step.trouble,
                    onChoose = startUp::choose,
                    onPin = startUp::submitPin,
                    onCancelPin = startUp::cancelPin,
                )

                is Step.Ready -> Catalog(
                    models = models,
                    siteName = state.siteName,
                    onSignedOut = startUp::signedOut,
                )
            }
        }
    }
}

@Composable
private fun Catalog(models: ViewModelProvider.Factory, siteName: String, onSignedOut: () -> Unit) {
    val catalog: CatalogModel = viewModel(factory = models)
    val playing: PlayingModel = viewModel(factory = models)
    val home by catalog.homeFlow.collectAsStateWithLifecycle()
    val title by catalog.titleFlow.collectAsStateWithLifecycle()
    val player by playing.flow.collectAsStateWithLifecycle()
    val signedOut by catalog.signedOutFlow.collectAsStateWithLifecycle()

    var where by remember { mutableStateOf<Where>(Where.Home) }

    // A token that stopped working while watching takes the app back to the
    // code screen rather than leaving a wall of refusals.
    LaunchedEffect(signedOut) {
        if (signedOut) {
            onSignedOut()
        }
    }

    BackHandler(enabled = where !is Where.Home) {
        when (where) {
            is Where.Playing -> {
                playing.stop()
                where = Where.Title((where as Where.Playing).titleSlug)
            }
            is Where.Title -> {
                catalog.forgetTitle()
                where = Where.Home
            }
            else -> Unit
        }
    }

    when (val place = where) {
        is Where.Home -> HomeScreen(
            state = home,
            siteName = siteName,
            onOpen = { slug ->
                catalog.openTitle(slug)
                where = Where.Title(slug)
            },
            onResume = { item ->
                playing.play(
                    titleSlug = item.title.slug,
                    episodeId = item.episode?.id,
                    heading = item.title.name,
                    detail = item.episode?.let { "S${it.seasonNumber} E${it.number}  ${it.name}" },
                    startAtSeconds = item.position,
                )
                where = Where.Playing(item.title.slug)
            },
            onRetry = catalog::loadHome,
        )

        is Where.Title -> TitleScreen(
            state = title,
            whatToPlay = catalog.whatToPlay(title),
            onPlay = { episodeId, positionSeconds ->
                val detail = title.detail ?: return@TitleScreen
                playing.play(
                    titleSlug = detail.slug,
                    episodeId = episodeId,
                    heading = detail.name,
                    detail = catalog.whatToPlay(title)?.detail,
                    startAtSeconds = positionSeconds,
                )
                where = Where.Playing(detail.slug)
            },
            onBack = {
                catalog.forgetTitle()
                where = Where.Home
            },
        )

        is Where.Playing -> PlayerScreen(
            state = player,
            onProgress = playing::at,
            onEnded = {
                playing.stop()
                where = Where.Title(place.titleSlug)
            },
            onBack = {
                playing.stop()
                where = Where.Title(place.titleSlug)
            },
        )
    }
}
