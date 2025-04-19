//go:build windows
// +build windows

package cmd

import (
	"os"
	"os/exec"
	"syscall"
)

// on Windows we do not create a pgroup; return nil so runCommand skips it.
func newSysProcAttr() *syscall.SysProcAttr {
	return nil
}

// killProcessGroup just sends os.Interrupt on Windows.
func killProcessGroup(cmd *exec.Cmd) {
	if cmd.Process != nil {
		_ = cmd.Process.Signal(os.Interrupt)
	}
}
