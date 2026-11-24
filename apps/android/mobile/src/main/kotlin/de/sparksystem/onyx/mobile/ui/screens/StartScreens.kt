// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.data.Profile
import de.sparksystem.onyx.mobile.ui.components.AccentButton
import de.sparksystem.onyx.mobile.ui.components.Page
import de.sparksystem.onyx.mobile.ui.components.QuietButton
import de.sparksystem.onyx.mobile.ui.components.Trouble
import de.sparksystem.onyx.mobile.ui.theme.LocalAccent

/** The fields of this app, in the site's colours rather than Material's. */
@Composable
private fun fieldColours() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = LocalAccent.current,
    unfocusedBorderColor = Onyx.line,
    focusedContainerColor = Onyx.ash,
    unfocusedContainerColor = Onyx.ash,
    focusedTextColor = Onyx.vein,
    unfocusedTextColor = Onyx.vein,
    cursorColor = LocalAccent.current,
    focusedLabelColor = LocalAccent.current,
    unfocusedLabelColor = Onyx.smoke,
)

/**
 * The first thing the app asks: which service is this?
 *
 * The same question the television asks, and for the same reason — this is
 * the client of a platform people run themselves. An operator who builds
 * their own copy sets the address in and nobody sees this.
 */
@Composable
fun ServerScreen(trouble: String?, busy: Boolean, onConnect: (String) -> Unit) {
    var address by remember { mutableStateOf("") }

    Page(
        heading = "Which service?",
        note = "The address of your service, the way you would reach it in a browser.",
    ) {
        OutlinedTextField(
            value = address,
            onValueChange = { address = it.trim() },
            label = { Text("Address") },
            placeholder = { Text("stream.example.com", color = Onyx.dust) },
            singleLine = true,
            enabled = !busy,
            colors = fieldColours(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Uri,
                imeAction = ImeAction.Go,
            ),
            keyboardActions = KeyboardActions(onGo = { onConnect(address) }),
            modifier = Modifier.fillMaxWidth(),
        )
        if (trouble != null) {
            Trouble(trouble)
        }
        AccentButton(
            text = if (busy) "Connecting" else "Connect",
            onClick = { if (!busy) onConnect(address) },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * Signing in with an email address and a password.
 *
 * A phone has a keyboard, and it is the device somebody would reach for to
 * approve a code anyway, so asking directly is one step rather than three.
 */
@Composable
fun SignInScreen(
    siteName: String,
    trouble: String?,
    busy: Boolean,
    onSignIn: (String, String) -> Unit,
    onChangeServer: () -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Page(heading = "Sign in to $siteName") {
        OutlinedTextField(
            value = email,
            onValueChange = { email = it.trim() },
            label = { Text("Email") },
            singleLine = true,
            enabled = !busy,
            colors = fieldColours(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            enabled = !busy,
            colors = fieldColours(),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Go,
            ),
            keyboardActions = KeyboardActions(onGo = { onSignIn(email, password) }),
            modifier = Modifier.fillMaxWidth(),
        )
        if (trouble != null) {
            Trouble(trouble)
        }
        AccentButton(
            text = if (busy) "Signing in" else "Sign in",
            onClick = { if (!busy) onSignIn(email, password) },
            modifier = Modifier.fillMaxWidth(),
        )
        QuietButton(
            text = "Change service",
            onClick = onChangeServer,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Who is watching. The same question the website and the television ask. */
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

    Page(heading = "Who is watching?") {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            items(profiles, key = { it.id }) { profile ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Card(
                        onClick = { onChoose(profile) },
                        shape = CircleShape,
                        colors = CardDefaults.cardColors(containerColor = colourOf(profile)),
                        modifier = Modifier.size(92.dp),
                    ) {
                        Column(
                            modifier = Modifier.size(92.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(
                                text = profile.name.take(1).uppercase(),
                                style = MaterialTheme.typography.displayMedium,
                                color = Onyx.onyx,
                            )
                        }
                    }
                    Row(Modifier.height(10.dp)) {}
                    Text(text = profile.name, style = MaterialTheme.typography.labelLarge)
                    if (profile.hasPin) {
                        Text(
                            text = "Needs a PIN",
                            style = MaterialTheme.typography.labelMedium,
                            color = Onyx.smoke,
                        )
                    }
                }
            }
        }
        if (trouble != null) {
            Trouble(trouble)
        }
    }
}

/** The colour a profile was given, or the accent of the service. */
@Composable
private fun colourOf(profile: Profile): Color {
    val stored = profile.color?.removePrefix("#")?.takeIf { it.length == 6 }
    return stored?.toLongOrNull(16)?.let { Color(0xFF000000 or it) } ?: LocalAccent.current
}

@Composable
private fun PinScreen(
    profile: Profile,
    trouble: String?,
    onPin: (Profile, String) -> Unit,
    onCancel: () -> Unit,
) {
    var pin by remember(profile.id) { mutableStateOf("") }

    Page(heading = "The PIN for ${profile.name}") {
        OutlinedTextField(
            value = pin,
            onValueChange = { typed -> pin = typed.filter(Char::isDigit).take(8) },
            label = { Text("PIN") },
            singleLine = true,
            colors = fieldColours(),
            visualTransformation = PasswordVisualTransformation('•'),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.NumberPassword,
                imeAction = ImeAction.Go,
            ),
            keyboardActions = KeyboardActions(onGo = { onPin(profile, pin) }),
            modifier = Modifier.fillMaxWidth(),
        )
        if (trouble != null) {
            Trouble(trouble)
        }
        AccentButton(
            text = "Continue",
            onClick = { onPin(profile, pin) },
            modifier = Modifier.fillMaxWidth(),
        )
        QuietButton(text = "Back", onClick = onCancel, modifier = Modifier.fillMaxWidth())
    }
}

/** The screen an app too old for its installation shows, and nothing else. */
@Composable
fun TooOldScreen(message: String, updateUrl: String?) {
    Page(
        heading = "Time to update",
        note = message + (updateUrl?.let { "\n\n$it" } ?: ""),
        modifier = Modifier.padding(0.dp),
    )
}
