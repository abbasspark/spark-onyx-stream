// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.mobile.ui.components.AccentButton
import de.sparksystem.onyx.mobile.ui.components.Hairline
import de.sparksystem.onyx.mobile.ui.components.QuietButton
import de.sparksystem.onyx.mobile.ui.components.SectionHeading
import de.sparksystem.onyx.mobile.ui.theme.GUTTER

/**
 * What this phone is: which service, who is watching, which version. The
 * same four things the television offers, and the same two questions asked
 * before anything that cannot be undone.
 */
@Composable
fun SettingsScreen(
    siteName: String,
    serverUrl: String?,
    viewerName: String?,
    profileName: String?,
    clientName: String,
    onChangeProfile: () -> Unit,
    onSignOut: () -> Unit,
    onForgetService: () -> Unit,
) {
    var asking by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = GUTTER, vertical = 16.dp),
    ) {
        SectionHeading(text = "This phone")
        Spacer(Modifier.height(16.dp))

        Fact(name = "Service", value = siteName)
        Fact(name = "Address", value = serverUrl ?: "Not set")
        if (viewerName != null) {
            Fact(name = "Signed in as", value = viewerName)
        }
        Fact(name = "Watching as", value = profileName ?: "Nobody yet")
        Fact(name = "App version", value = clientName)

        Spacer(Modifier.height(26.dp))

        when (asking) {
            "sign-out" -> Confirm(
                question = "Sign out?",
                note = "The address stays, so signing back in needs your password and nothing else.",
                onYes = onSignOut,
                onNo = { asking = null },
            )

            "forget" -> Confirm(
                question = "Forget this service?",
                note = "The app goes back to asking which service it belongs to.",
                onYes = onForgetService,
                onNo = { asking = null },
            )

            else -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AccentButton(
                    text = "Change who is watching",
                    onClick = onChangeProfile,
                    modifier = Modifier.fillMaxWidth(),
                )
                QuietButton(
                    text = "Sign out",
                    onClick = { asking = "sign-out" },
                    modifier = Modifier.fillMaxWidth(),
                )
                QuietButton(
                    text = "Forget this service",
                    onClick = { asking = "forget" },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun Fact(name: String, value: String) {
    Column {
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                color = Onyx.smoke,
                modifier = Modifier.width(150.dp),
            )
            Text(text = value, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
        }
        Hairline()
    }
}

/** Anything that cannot be undone is asked about once, in plain words. */
@Composable
private fun Confirm(question: String, note: String, onYes: () -> Unit, onNo: () -> Unit) {
    Column {
        Text(text = question, style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(8.dp))
        Text(text = note, style = MaterialTheme.typography.bodyMedium, color = Onyx.smoke)
        Spacer(Modifier.height(18.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            AccentButton(text = "Yes", onClick = onYes, modifier = Modifier.width(120.dp))
            QuietButton(text = "No", onClick = onNo, modifier = Modifier.width(120.dp))
        }
    }
}
