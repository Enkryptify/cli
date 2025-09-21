package ui

import (
	"fmt"
)

func ShowAuthSuccess(email string) {
	fmt.Println()
	PrintSeparator()
	PrintSuccess("Successfully authenticated with Enkryptify!")
	if email != "" {
		PrintInfo(fmt.Sprintf("Logged in as: %s", email))
	}
	PrintInfo("You can now use the Enkryptify CLI to manage your secrets.")
	PrintSeparator()
}

func ShowAuthError(err error) {
	fmt.Println()
	PrintSeparator()
	PrintError("Authentication failed!")
	PrintError(err.Error())
	PrintInfo("Please try running 'ek login' again.")
	PrintSeparator()
}

func ShowWaitingForAuth() {
	fmt.Println()
	PrintInfo("Waiting for authentication to complete...")
	PrintSubtitle("Please complete the authentication in your web browser.")
}