// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.tv.ui.components.AccentButton
import de.sparksystem.onyx.tv.ui.components.BandMark
import de.sparksystem.onyx.tv.ui.components.QrCode
import de.sparksystem.onyx.tv.ui.components.Trouble
import de.sparksystem.onyx.tv.ui.theme.LocalAccent
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.tv.ui.theme.Safe

/**
 * Signing in without a keyboard.
 *
 * The television shows a short code and a square. The viewer picks up the
 * phone that is already in their hand, opens the page and types six
 * characters; the television is watching and lets itself in. Nobody spells
 * an email address with four arrows.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SignInScreen(
    siteName: String,
    userCode: String?,
    verificationUrl: String?,
    qrUrl: String?,
    trouble: String?,
    onRetry: () -> Unit,
    onChangeServer: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .padding(horizontal = Safe.horizontal, vertical = Safe.vertical),
    ) {
        Row(
            modifier = Modifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(72.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                BandMark(width = 52)
                Spacer(Modifier.height(28.dp))
                Text(
                    text = "Sign in to $siteName",
                    style = MaterialTheme.typography.displayMedium,
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    text = if (verificationUrl != null) {
                        "On your phone or computer, go to $verificationUrl and enter this code."
                    } else {
                        "Getting a code from your service."
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = Onyx.smoke,
                    modifier = Modifier.width(560.dp),
                )

                Spacer(Modifier.height(36.dp))
                if (userCode != null) {
                    // The code is the one thing on this screen that has to be
                    // read from a sofa, so it is set as large as it can be.
                    Text(
                        text = userCode,
                        style = MaterialTheme.typography.displayLarge.copy(
                            fontSize = 92.sp,
                            letterSpacing = 10.sp,
                        ),
                        color = LocalAccent.current,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = "The code is good for a few minutes. It changes if it runs out.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Onyx.dust,
                    )
                }

                if (trouble != null) {
                    Spacer(Modifier.height(24.dp))
                    Trouble(trouble, modifier = Modifier.width(560.dp))
                }

                Spacer(Modifier.height(36.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    AccentButton(text = "Get a new code", onClick = onRetry)
                    AccentButton(text = "Change service", onClick = onChangeServer)
                }
            }

            if (qrUrl != null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier
                            .size(380.dp)
                            .background(Onyx.coal)
                            .padding(16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        QrCode(content = qrUrl, modifier = Modifier.fillMaxSize())
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "Or point a phone camera here",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Onyx.smoke,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}
