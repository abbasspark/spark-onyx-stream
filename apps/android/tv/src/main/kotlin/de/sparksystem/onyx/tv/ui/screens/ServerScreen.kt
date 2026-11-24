// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.tv.ui.components.AccentButton
import de.sparksystem.onyx.tv.ui.components.Page
import de.sparksystem.onyx.tv.ui.components.Trouble
import de.sparksystem.onyx.tv.ui.theme.LocalAccent
import de.sparksystem.onyx.Onyx

/**
 * The first thing a television asks: which service is this?
 *
 * This app is the client of a platform people run themselves, so there is no
 * single address to connect to. An operator who builds their own copy sets
 * it at build time and never sees this screen; everyone else types it once.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ServerScreen(
    trouble: String?,
    busy: Boolean,
    onConnect: (String) -> Unit,
    initial: String = "",
) {
    var address by remember { mutableStateOf(initial) }
    val field = remember { FocusRequester() }

    Page(
        heading = "Which service?",
        note = "Type the address of your service, the way you would reach it in a browser. " +
            "Your service shows it on the page you signed in on.",
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BasicTextField(
                value = address,
                onValueChange = { address = it.trim() },
                singleLine = true,
                enabled = !busy,
                cursorBrush = SolidColor(LocalAccent.current),
                textStyle = MaterialTheme.typography.titleMedium.copy(color = Onyx.vein),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Go,
                ),
                keyboardActions = KeyboardActions(onGo = { onConnect(address) }),
                modifier = Modifier
                    .focusRequester(field)
                    .width(620.dp)
                    .height(64.dp)
                    .background(Onyx.ash)
                    .border(2.dp, Onyx.line)
                    .padding(horizontal = 20.dp, vertical = 18.dp),
                decorationBox = { inner ->
                    if (address.isEmpty()) {
                        Text(
                            text = "stream.example.com",
                            style = MaterialTheme.typography.titleMedium,
                            color = Onyx.dust,
                        )
                    }
                    inner()
                },
            )
            AccentButton(
                text = if (busy) "Connecting" else "Connect",
                onClick = { if (!busy) onConnect(address) },
            )
        }

        if (trouble != null) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Trouble(trouble)
            }
        }
    }
}
