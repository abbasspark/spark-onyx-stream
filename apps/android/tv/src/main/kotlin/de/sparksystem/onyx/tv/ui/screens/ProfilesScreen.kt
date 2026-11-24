// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.data.Profile
import de.sparksystem.onyx.tv.ui.components.AccentButton
import de.sparksystem.onyx.tv.ui.components.Page
import de.sparksystem.onyx.tv.ui.components.Trouble
import de.sparksystem.onyx.tv.ui.theme.LocalAccent
import de.sparksystem.onyx.Onyx

/** The colour a profile was given, or the accent of the service. */
@Composable
private fun colourOf(profile: Profile): Color {
    val stored = profile.color?.removePrefix("#")?.takeIf { it.length == 6 }
    return stored
        ?.toLongOrNull(16)
        ?.let { Color(0xFF000000 or it) }
        ?: LocalAccent.current
}

/**
 * Who is watching. The same question the website asks, with tiles big enough
 * to pick from across a room.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ProfilesScreen(
    profiles: List<Profile>,
    asking: Profile?,
    trouble: String?,
    onChoose: (Profile) -> Unit,
    onPin: (Profile, String) -> Unit,
    onCancelPin: () -> Unit,
) {
    if (asking != null) {
        PinScreen(profile = asking, trouble = trouble, onPin = onPin, onCancel = onCancelPin)
        return
    }

    Page(
        heading = "Who is watching?",
        note = "Each profile keeps its own “Continue watching” and its own marks.",
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            for (profile in profiles) {
                ProfileTile(profile = profile, onClick = { onChoose(profile) })
            }
        }
        if (trouble != null) {
            Trouble(trouble)
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ProfileTile(profile: Profile, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Card(
            onClick = onClick,
            colors = CardDefaults.colors(containerColor = colourOf(profile)),
            border = CardDefaults.border(
                focusedBorder = androidx.tv.material3.Border(
                    border = androidx.compose.foundation.BorderStroke(4.dp, Onyx.vein),
                ),
            ),
            scale = CardDefaults.scale(focusedScale = 1.08f),
            modifier = Modifier.size(168.dp),
        ) {
            Box(modifier = Modifier.size(168.dp), contentAlignment = Alignment.Center) {
                Text(
                    text = profile.name.take(1).uppercase(),
                    style = MaterialTheme.typography.displayLarge,
                    color = Onyx.onyx,
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        Text(text = profile.name, style = MaterialTheme.typography.titleMedium)
        if (profile.isKids) {
            Text(
                text = "For children",
                style = MaterialTheme.typography.labelMedium,
                color = Onyx.smoke,
            )
        } else if (profile.hasPin) {
            Text(
                text = "Needs a PIN",
                style = MaterialTheme.typography.labelMedium,
                color = Onyx.smoke,
            )
        }
    }
}

/** The PIN of a profile, entered with the digits of the remote control. */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PinScreen(
    profile: Profile,
    trouble: String?,
    onPin: (Profile, String) -> Unit,
    onCancel: () -> Unit,
) {
    var pin by remember(profile.id) { mutableStateOf("") }
    val field = remember { FocusRequester() }
    LaunchedEffect(profile.id) { field.requestFocus() }

    Page(heading = "The PIN for ${profile.name}") {
        BasicTextField(
            value = pin,
            onValueChange = { typed -> pin = typed.filter(Char::isDigit).take(8) },
            singleLine = true,
            cursorBrush = SolidColor(LocalAccent.current),
            visualTransformation = PasswordVisualTransformation('•'),
            textStyle = MaterialTheme.typography.displayMedium.copy(
                color = Onyx.vein,
                textAlign = TextAlign.Center,
                letterSpacing = 12.sp,
            ),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.NumberPassword,
                imeAction = ImeAction.Go,
            ),
            keyboardActions = KeyboardActions(onGo = { onPin(profile, pin) }),
            modifier = Modifier
                .focusRequester(field)
                .width(320.dp)
                .height(84.dp)
                .background(Onyx.ash)
                .border(2.dp, Onyx.line)
                .padding(vertical = 20.dp),
        )
        if (trouble != null) {
            Trouble(trouble)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            AccentButton(text = "Continue", onClick = { onPin(profile, pin) })
            AccentButton(text = "Back", onClick = onCancel)
        }
        Spacer(Modifier.fillMaxWidth().height(1.dp))
    }
}
