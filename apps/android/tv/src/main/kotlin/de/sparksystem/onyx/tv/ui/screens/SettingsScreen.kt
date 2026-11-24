// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.tv.ui.components.AccentButton
import de.sparksystem.onyx.tv.ui.components.Hairline
import de.sparksystem.onyx.tv.ui.components.SectionHeading
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.tv.ui.theme.Safe

/**
 * What this television is: which service, who is watching, which version.
 *
 * Settings on a television are not a place anybody visits for pleasure, so
 * there is nothing here but the four things that are occasionally needed and
 * the facts worth quoting when a viewer writes in.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SettingsScreen(
    siteName: String,
    /** What this app calls itself to the API, for the line a viewer quotes. */
    clientName: String,
    serverUrl: String?,
    viewerName: String?,
    profileName: String?,
    onChangeProfile: () -> Unit,
    onSignOut: () -> Unit,
    onForgetService: () -> Unit,
) {
    /** Signing out and forgetting a service are both asked about first. */
    var asking by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .padding(horizontal = Safe.horizontal, vertical = Safe.vertical),
    ) {
        SectionHeading(text = "This television")
        Spacer(Modifier.height(24.dp))

        Column(modifier = Modifier.width(760.dp)) {
            Fact(name = "Service", value = siteName)
            Fact(name = "Address", value = serverUrl ?: "Not set")
            if (viewerName != null) {
                Fact(name = "Signed in as", value = viewerName)
            }
            Fact(name = "Watching as", value = profileName ?: "Nobody yet")
            Fact(
                name = "App version",
                value = clientName,
            )
        }

        Spacer(Modifier.height(36.dp))

        when (asking) {
            "sign-out" -> Confirm(
                question = "Sign this television out?",
                note = "The address stays, so signing back in needs a new code and nothing else.",
                onYes = onSignOut,
                onNo = { asking = null },
            )

            "forget" -> Confirm(
                question = "Forget this service?",
                note = "The television goes back to asking which service it belongs to. " +
                    "Do this when you are handing it on to somebody else.",
                onYes = onForgetService,
                onNo = { asking = null },
            )

            else -> Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                AccentButton(text = "Change who is watching", onClick = onChangeProfile)
                AccentButton(text = "Sign out", onClick = { asking = "sign-out" })
                AccentButton(text = "Forget this service", onClick = { asking = "forget" })
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun Fact(name: String, value: String) {
    Column {
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                color = Onyx.smoke,
                modifier = Modifier.width(220.dp),
            )
            Text(text = value, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
        }
        Hairline()
    }
}

/** Anything that cannot be undone is asked about once, in plain words. */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun Confirm(
    question: String,
    note: String,
    onYes: () -> Unit,
    onNo: () -> Unit,
) {
    Box(modifier = Modifier.width(760.dp)) {
        Column {
            Text(text = question, style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(10.dp))
            Text(
                text = note,
                style = MaterialTheme.typography.bodyMedium,
                color = Onyx.smoke,
            )
            Spacer(Modifier.height(22.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AccentButton(text = "Yes", onClick = onYes)
                AccentButton(text = "No", onClick = onNo)
            }
        }
    }
}
