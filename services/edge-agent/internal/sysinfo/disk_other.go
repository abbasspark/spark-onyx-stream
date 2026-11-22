// SPDX-License-Identifier: AGPL-3.0-only

//go:build !unix

package sysinfo

func disk(string) (free, total int64, ok bool) { return 0, 0, false }
