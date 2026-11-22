// SPDX-License-Identifier: AGPL-3.0-only

//go:build unix

package sysinfo

import "syscall"

func disk(dir string) (free, total int64, ok bool) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(dir, &stat); err != nil {
		return 0, 0, false
	}
	blockSize := int64(stat.Bsize) //nolint:unconvert // the type differs between systems
	return int64(stat.Bavail) * blockSize, int64(stat.Blocks) * blockSize, true
}
