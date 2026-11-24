// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import de.sparksystem.onyx.Container
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.data.Channel
import de.sparksystem.onyx.data.TitleCard
import de.sparksystem.onyx.mobile.ui.screens.HomeScreen
import de.sparksystem.onyx.mobile.ui.screens.LivePlayerScreen
import de.sparksystem.onyx.mobile.ui.screens.LineupScreen
import de.sparksystem.onyx.mobile.ui.screens.PlayerScreen
import de.sparksystem.onyx.mobile.ui.screens.ProfilesScreen
import de.sparksystem.onyx.mobile.ui.screens.SavedScreen
import de.sparksystem.onyx.mobile.ui.screens.SearchScreen
import de.sparksystem.onyx.mobile.ui.screens.ServerScreen
import de.sparksystem.onyx.mobile.ui.screens.SettingsScreen
import de.sparksystem.onyx.mobile.ui.screens.SignInScreen
import de.sparksystem.onyx.mobile.ui.screens.TitleScreen
import de.sparksystem.onyx.mobile.ui.screens.TooOldScreen
import de.sparksystem.onyx.mobile.ui.theme.LocalAccent
import de.sparksystem.onyx.mobile.ui.theme.OnyxTheme
import de.sparksystem.onyx.ui.CatalogModel
import de.sparksystem.onyx.ui.LiveModel
import de.sparksystem.onyx.ui.PlayingModel
import de.sparksystem.onyx.ui.SavedModel
import de.sparksystem.onyx.ui.SearchModel
import de.sparksystem.onyx.ui.SignInStyle
import de.sparksystem.onyx.ui.StartUpModel
import de.sparksystem.onyx.ui.StartUpState
import de.sparksystem.onyx.ui.Step

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
        // A phone has a keyboard, so it signs in by asking rather than by
        // showing a code for a second device to approve.
        modelClass.isAssignableFrom(StartUpModel::class.java) ->
            StartUpModel(container, SignInStyle.Password) as T
        modelClass.isAssignableFrom(CatalogModel::class.java) -> CatalogModel(container) as T
        modelClass.isAssignableFrom(PlayingModel::class.java) -> PlayingModel(container) as T
        modelClass.isAssignableFrom(LiveModel::class.java) -> LiveModel(container) as T
        modelClass.isAssignableFrom(SearchModel::class.java) -> SearchModel(container) as T
        modelClass.isAssignableFrom(SavedModel::class.java) -> SavedModel(container) as T
        else -> throw IllegalArgumentException("No model for ${modelClass.name}")
    }
}

/** Where the app is. The bar at the foot moves between the first five. */
private sealed interface Where {
    data object Home : Where
    data object Live : Where
    data object Search : Where
    data object Saved : Where
    data object Settings : Where
    data class Title(val slug: String) : Where
    data class Playing(val titleSlug: String) : Where
    data object Watching : Where
}

private data class Place(val where: Where, val name: String, val icon: ImageVector)

private val PLACES = listOf(
    Place(Where.Home, "Home", Icons.Default.Home),
    Place(Where.Live, "Live", Icons.Default.LiveTv),
    Place(Where.Search, "Search", Icons.Default.Search),
    Place(Where.Saved, "My list", Icons.Default.Bookmark),
    Place(Where.Settings, "Settings", Icons.Default.Settings),
)

@Composable
private fun App(container: Container) {
    val models = remember { Models(container) }
    val startUp: StartUpModel = viewModel(factory = models)
    val state by startUp.flow.collectAsStateWithLifecycle()

    OnyxTheme(accent = state.accent) {
        when (val step = state.step) {
            is Step.Starting -> de.sparksystem.onyx.mobile.ui.components.Waiting("Starting")

            is Step.NeedsServer -> ServerScreen(
                trouble = step.trouble,
                busy = step.busy,
                onConnect = startUp::connectTo,
            )

            is Step.TooOld -> TooOldScreen(step.message, step.updateUrl)

            is Step.NeedsSignIn -> SignInScreen(
                siteName = state.siteName,
                trouble = step.trouble,
                busy = step.busy,
                onSignIn = startUp::signInWith,
                onChangeServer = startUp::changeServer,
            )

            is Step.SigningIn -> de.sparksystem.onyx.mobile.ui.components.Waiting("Signing in")

            is Step.ChoosingProfile -> ProfilesScreen(
                profiles = step.profiles,
                asking = step.asking,
                trouble = step.trouble,
                onChoose = startUp::choose,
                onPin = startUp::submitPin,
                onCancelPin = startUp::cancelPin,
            )

            is Step.Ready -> Catalog(models = models, state = state, startUp = startUp)
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
    val searchState by search.flow.collectAsStateWithLifecycle()
    val savedState by saved.flow.collectAsStateWithLifecycle()
    val signedOut by catalog.signedOutFlow.collectAsStateWithLifecycle()

    var where by remember { mutableStateOf<Where>(Where.Home) }

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
            is Where.Watching -> {
                live.stopWatching()
                Where.Live
            }
            else -> Where.Home
        }
    }

    fun goTo(place: Where) {
        if (place == Where.Live) {
            live.loadChannels()
        }
        if (place == Where.Saved) {
            saved.load()
        }
        where = place
    }

    // A video fills the screen: no bar at the foot, nothing else on it.
    if (where is Where.Playing) {
        val place = where as Where.Playing
        PlayerScreen(
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
        return
    }

    if (where is Where.Watching) {
        LivePlayerScreen(
            state = liveState,
            onBack = {
                live.stopWatching()
                where = Where.Live
            },
        )
        return
    }

    Scaffold(
        containerColor = Onyx.onyx,
        bottomBar = {
            NavigationBar(containerColor = Onyx.coal) {
                for (place in PLACES) {
                    NavigationBarItem(
                        selected = where == place.where,
                        onClick = { goTo(place.where) },
                        icon = { Icon(place.icon, contentDescription = null) },
                        label = { Text(place.name) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Onyx.onyx,
                            selectedTextColor = LocalAccent.current,
                            indicatorColor = LocalAccent.current,
                            unselectedIconColor = Onyx.smoke,
                            unselectedTextColor = Onyx.smoke,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Onyx.onyx)
                .padding(padding),
        ) {
            when (val place = where) {
                is Where.Home -> HomeScreen(
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
                            detail = item.episode?.let {
                                "S${it.seasonNumber} E${it.number}  ${it.name}"
                            },
                            startAtSeconds = item.position,
                        )
                        where = Where.Playing(item.title.slug)
                    },
                    onRetry = catalog::loadHome,
                )

                is Where.Live -> LineupScreen(
                    state = liveState,
                    onWatch = { channel: Channel ->
                        live.tuneTo(channel)
                        where = Where.Watching
                    },
                    onRetry = live::loadChannels,
                )

                is Where.Search -> SearchScreen(
                    state = searchState,
                    onType = search::type,
                    onOpen = { slug ->
                        catalog.openTitle(slug)
                        where = Where.Title(slug)
                    },
                )

                is Where.Saved -> SavedScreen(
                    state = savedState,
                    onOpen = { slug ->
                        catalog.openTitle(slug)
                        where = Where.Title(slug)
                    },
                )

                is Where.Settings -> SettingsScreen(
                    siteName = state.siteName,
                    serverUrl = state.serverUrl,
                    viewerName = state.viewerName,
                    profileName = state.profileName,
                    clientName = CLIENT,
                    onChangeProfile = startUp::changeProfile,
                    onSignOut = startUp::signedOut,
                    onForgetService = startUp::forgetService,
                )

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

                else -> Unit
            }
        }
    }
}
