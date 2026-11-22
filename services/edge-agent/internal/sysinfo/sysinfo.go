// SPDX-License-Identifier: AGPL-3.0-only

// Package sysinfo reads what the heartbeat says about the machine.
package sysinfo

import (
	"os"
	"runtime"
	"strconv"
	"strings"
)

// System is the form the main server expects. A nil field is one this system does not tell.
type System struct {
	CPUs           int      `json:"cpus"`
	Load1          *float64 `json:"load1"`
	DiskFreeBytes  *int64   `json:"diskFreeBytes"`
	DiskTotalBytes *int64   `json:"diskTotalBytes"`
}

// Read looks at the machine and at the disk that holds dir.
func Read(dir string) System {
	system := System{CPUs: runtime.NumCPU(), Load1: load1()}
	if free, total, ok := disk(dir); ok {
		system.DiskFreeBytes, system.DiskTotalBytes = &free, &total
	}
	return system
}

// load1 is the load of the last minute, where the system has such a file.
func load1() *float64 {
	content, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return nil
	}
	fields := strings.Fields(string(content))
	if len(fields) == 0 {
		return nil
	}
	value, err := strconv.ParseFloat(fields[0], 64)
	if err != nil || value < 0 {
		return nil
	}
	return &value
}
