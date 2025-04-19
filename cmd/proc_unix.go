//go:build !windows
// +build !windows

package cmd

import (
	"os/exec"
	"syscall"
)

// newSysProcAttr returns a SysProcAttr that places the child in its
// own process group (so we can signal the entire tree).
func newSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setpgid: true}
}

// killProcessGroup sends SIGINT to the process group (negative pid).
func killProcessGroup(cmd *exec.Cmd) {
	if cmd.Process != nil {
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGINT)
	}
}
