// SPDX-License-Identifier: AGPL-3.0-only

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "onyx-android"

// What the two apps share: the API, what a device remembers, and every
// decision that is the same on a television and in a hand.
include(":core")

// The apps themselves, which are screens and little else.
include(":tv")
include(":mobile")
