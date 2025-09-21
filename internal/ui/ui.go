package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	primaryColor   = lipgloss.Color("#2B7FFF")
	errorColor     = lipgloss.Color("#E64545")
	warningColor   = lipgloss.Color("#FFC233")
	successColor   = lipgloss.Color("#2AC769")
	mutedColor     = lipgloss.Color("#777777")

	// Base styles
	titleStyle = lipgloss.NewStyle().
			Foreground(primaryColor).
			Bold(true).
			Margin(1, 0)

	subtitleStyle = lipgloss.NewStyle().
			Foreground(mutedColor).
			Italic(true)

	successStyle = lipgloss.NewStyle().
			Foreground(successColor).
			Bold(true)

	errorStyle = lipgloss.NewStyle().
			Foreground(errorColor).
			Bold(true)

	warningStyle = lipgloss.NewStyle().
			Foreground(warningColor).
			Bold(true)

	infoStyle = lipgloss.NewStyle()

	codeStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("#2A2A2A")).
			Foreground(lipgloss.Color("#FFFFFF")).
			Padding(0, 1).
			Margin(1, 0)
)

// Spinner represents a simple text-based loading spinner
type Spinner struct {
	frames []string
	index  int
}

// NewSpinner creates a new spinner instance
func NewSpinner() *Spinner {
	return &Spinner{
		frames: []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"},
		index:  0,
	}
}

// Next returns the next frame of the spinner
func (s *Spinner) Next() string {
	frame := s.frames[s.index]
	s.index = (s.index + 1) % len(s.frames)
	return frame
}

// PrintTitle prints a styled title
func PrintTitle(title string) {
	fmt.Println(titleStyle.Render(title))
}

// PrintSubtitle prints a styled subtitle
func PrintSubtitle(subtitle string) {
	fmt.Println(subtitleStyle.Render(subtitle))
}

// PrintSuccess prints a success message
func PrintSuccess(message string) {
	fmt.Println(successStyle.Render("✓ " + message))
}

// PrintError prints an error message
func PrintError(message string) {
	fmt.Println(errorStyle.Render("✗ " + message))
}

// PrintWarning prints a warning message
func PrintWarning(message string) {
	fmt.Println(warningStyle.Render("⚠ " + message))
}

// PrintInfo prints an info message
func PrintInfo(message string) {
	fmt.Println(infoStyle.Render(message))
}

// PrintCode prints code or URLs in a styled box
func PrintCode(code string) {
	fmt.Println(codeStyle.Render(code))
}

// PrintSeparator prints a visual separator
func PrintSeparator() {
	separator := strings.Repeat("─", 60)
	fmt.Println(lipgloss.NewStyle().Foreground(mutedColor).Render(separator))
}

// ShowLoadingMessage shows a loading message with optional spinner
func ShowLoadingMessage(message string, showSpinner bool) {
	if showSpinner {
		spinner := NewSpinner()
		fmt.Printf("\r%s %s", spinner.Next(), message)
	} else {
		PrintInfo(message)
	}
}

// ConfirmAction asks for user confirmation
func ConfirmAction(message string) bool {
	fmt.Printf("%s (y/N): ", message)
	var response string
	fmt.Scanln(&response)
	return strings.ToLower(strings.TrimSpace(response)) == "y"
}

// ShowProviderInfo shows information about the current provider
func ShowProviderInfo(provider string, authenticated bool) {
	PrintInfo(fmt.Sprintf("Provider: %s", provider))
	if authenticated {
		PrintSuccess("Status: Authenticated")
	} else {
		PrintWarning("Status: Not authenticated")
	}
}

// ShowBrandHeader shows the Enkryptify brand header
func ShowBrandHeader() {
	header := `
   _____       _                     _   _  __       
  | ____|_ __ | | ___ __ _   _ _ __ | |_(_)/ _|_   _ 
  |  _| | '_ \| |/ / '__| | | | '_ \| __| | |_| | | |
  | |___| | | |   <| |  | |_| | |_) | |_| |  _| |_| |
  |_____|_| |_|_|\_\_|   \__, | .__/ \__|_|_|  \__, |
                         |___/|_|               |___/ 
`
	
	fmt.Println(titleStyle.Render(header))
	PrintSeparator()
}
