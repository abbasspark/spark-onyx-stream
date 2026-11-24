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
import androidx.compose.foundation.layout.Column
import de.sparksystem.onyx.Container
import de.sparksystem.onyx.data.Channel
import de.sparksystem.onyx.data.TitleCard
import de.sparksystem.onyx.ui.CatalogModel
import de.sparksystem.onyx.ui.LiveModel
import de.sparksystem.onyx.ui.PlayingModel
import de.sparksystem.onyx.ui.SavedModel
import de.sparksystem.onyx.ui.SearchModel
import de.sparksystem.onyx.ui.StartUpModel
import de.sparksystem.onyx.ui.StartUpState
import de.sparksystem.onyx.ui.Step
import de.sparksystem.onyx.tv.ui.components.Page
import de.sparksystem.onyx.tv.ui.components.TopNav
import de.sparksystem.onyx.tv.ui.components.Waiting
import de.sparksystem.onyx.tv.ui.screens.GuideScreen
import de.sparksystem.onyx.tv.ui.screens.HomeScreen
import de.sparksystem.onyx.tv.ui.screens.LineupScreen
import de.sparksystem.onyx.tv.ui.screens.LivePlayerScreen
import de.sparksystem.onyx.tv.ui.screens.PlayerScreen
import de.sparksystem.onyx.tv.ui.screens.ProfilesScreen
import de.sparksystem.onyx.tv.ui.screens.SavedScreen
import de.sparksystem.onyx.tv.ui.screens.SearchScreen
import de.sparksystem.onyx.tv.ui.screens.ServerScreen
import de.sparksystem.onyx.tv.ui.screens.SettingsScreen
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
        modelClass.isAssignableFrom(LiveModel::class.java) -> LiveModel(container) as T
        modelClass.isAssignableFrom(SearchModel::class.java) -> SearchModel(container) as T
        modelClass.isAssignableFrom(SavedModel::class.java) -> SavedModel(container) as T
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
    data object Lineup : Where
    data object Live : Where
    data object Guide : Where
    data object Search : Where
    data object Saved : Where
    data object Settings : Where
}

/**
 * The places the navigation across the top moves between, in the order a
 * viewer reaches for them: what to watch, then live, then the two they go
 * looking for, then the one they visit twice a year.
 */
private val PLACES = listOf("Home", "Live", "Search", "My list", "Settings")

/** Which place each item of the navigation stands for. */
private val NAV = listOf(Where.Home, Where.Lineup, Where.Search, Where.Saved, Where.Settings)

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

                // A television signs in by code, so this never comes up here.
                is Step.NeedsSignIn -> Waiting("Signing in")

                is Step.Ready -> Catalog(models = models, state = state, startUp = startUp)
            }
        }
    }
}

@Composable
private fun Catalog(
    models: ViewModelProvider.Factory,
    state: StartUpState,
    startUp: StartUpModel,
) {
    val catalog: CatalogModel = viewModel(factory = models)
    val playing: PlayingModel = viewModel(factory = models)
    val live: LiveModel = viewModel(factory = models)
    val search: SearchModel = viewModel(factory = models)
    val saved: SavedModel = viewModel(factory = models)
    val home by catalog.homeFlow.collectAsStateWithLifecycle()
    val title by catalog.titleFlow.collectAsStateWithLifecycle()
    val player by playing.flow.collectAsStateWithLifecycle()
    val liveState by live.flow.collectAsStateWithLifecycle()
    val goBackTo by live.goBackFlow.collectAsStateWithLifecycle()
    val searchState by search.flow.collectAsStateWithLifecycle()
    val savedState by saved.flow.collectAsStateWithLifecycle()
    val signedOut by catalog.signedOutFlow.collectAsStateWithLifecycle()

    var where by remember { mutableStateOf<Where>(Where.Home) }

    // A token that stopped working while watching takes the app back to the
    // code screen rather than leaving a wall of refusals.
    LaunchedEffect(signedOut) {
        if (signedOut) {
            startUp.signedOut()
        }
    }

    BackHandler(enabled = where !is Where.Home) {
        where = when (val place = where) {
            is Where.Playing -> {
                playing.stop()
                Where.Title(place.titleSlug)
            }
            is Where.Title -> {
                catalog.forgetTitle()
                Where.Home
            }
            // Out of the guide back to whatever was behind it.
            is Where.Guide -> if (liveState.playback != null) Where.Live else Where.Lineup
            is Where.Live -> {
                live.stopWatching()
                Where.Lineup
            }
            else -> Where.Home
        }
    }

    /** The navigation across the top, which every screen under it shares. */
    fun goTo(index: Int) {
        val wanted = NAV.getOrNull(index) ?: Where.Home
        if (wanted == Where.Lineup) {
            live.loadChannels()
        }
        if (wanted == Where.Saved) {
            saved.load()
        }
        where = wanted
    }

    /** Takes a channel, and goes to the picture. */
    fun watch(channel: Channel) {
        live.tuneTo(channel)
        where = Where.Live
    }

    when (val place = where) {
        is Where.Home -> WithNav(at = 0, onGo = ::goTo) {
            HomeScreen(
                state = home,
                siteName = state.siteName,
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
        }

        is Where.Lineup -> WithNav(at = 1, onGo = ::goTo) {
            LineupScreen(
                state = liveState,
                onWatch = ::watch,
                onGuide = {
                    live.loadGuide()
                    where = Where.Guide
                },
                onRetry = live::loadChannels,
            )
        }

        is Where.Live -> LivePlayerScreen(
            state = liveState,
            programmes = live.ownRow(),
            goBackTo = goBackTo,
            onWentBack = live::wentBack,
            onZap = live::zap,
            onNumber = { number -> live.tuneToNumber(number) },
            onGuide = {
                live.loadGuide()
                where = Where.Guide
            },
            onLineup = {
                live.stopWatching()
                where = Where.Lineup
            },
            onBack = {
                live.stopWatching()
                where = Where.Lineup
            },
        )

        is Where.Guide -> GuideScreen(
            state = liveState,
            onPick = { pick ->
                val began = pick.beganAt
                // A programme already sent, on a channel that keeps what it
                // sent, is worth going back to. Anything else just tunes.
                if (began != null && began < System.currentTimeMillis() && pick.channel.keeps) {
                    live.goBackTo(pick.channel, began)
                } else {
                    live.tuneTo(pick.channel)
                }
                where = Where.Live
            },
            onBack = {
                where = if (liveState.playback != null) Where.Live else Where.Lineup
            },
        )

        is Where.Search -> WithNav(at = 2, onGo = ::goTo) {
            SearchScreen(
                state = searchState,
                onType = search::type,
                onOpen = { slug ->
                    catalog.openTitle(slug)
                    where = Where.Title(slug)
                },
            )
        }

        is Where.Saved -> WithNav(at = 3, onGo = ::goTo) {
            SavedScreen(
                state = savedState,
                onOpen = { slug ->
                    catalog.openTitle(slug)
                    where = Where.Title(slug)
                },
            )
        }

        is Where.Settings -> WithNav(at = 4, onGo = ::goTo) {
            SettingsScreen(
                siteName = state.siteName,
                clientName = CLIENT,
                serverUrl = state.serverUrl,
                viewerName = state.viewerName,
                profileName = state.profileName,
                onChangeProfile = startUp::changeProfile,
                onSignOut = startUp::signedOut,
                onForgetService = startUp::forgetService,
            )
        }

        is Where.Title -> TitleScreen(
            state = title,
            whatToPlay = catalog.whatToPlay(title),
            saved = title.detail?.let { savedState.slugs.contains(it.slug) } == true,
            onToggleSaved = {
                title.detail?.let { detail ->
                    saved.toggle(
                        TitleCard(
                            id = detail.id,
                            type = detail.type,
                            slug = detail.slug,
                            name = detail.name,
                            tagline = detail.tagline,
                            releaseYear = detail.releaseYear,
                            ageRating = detail.ageRating,
                            access = detail.access,
                            poster = detail.poster,
                            backdrop = detail.backdrop,
                            categories = detail.categories,
                            durationMs = detail.durationMs,
                        ),
                    )
                }
            },
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

/** A screen with the navigation across the top of it. */
@Composable
private fun WithNav(
    at: Int,
    onGo: (Int) -> Unit,
    content: @Composable () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopNav(places = PLACES, at = at, onGo = onGo)
        content()
    }
}
