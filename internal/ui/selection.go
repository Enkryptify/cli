package ui

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// capitalize returns a string with the first letter capitalized
func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

type SelectionItem struct {
	ID          string
	Name        string
	Slug        string
	Description string
}

// Terminal control functions
func enableRawMode() (*exec.Cmd, error) {
	cmd := exec.Command("stty", "-echo", "cbreak")
	cmd.Stdin = os.Stdin
	return cmd, cmd.Run()
}

func disableRawMode() {
	cmd := exec.Command("stty", "echo", "-cbreak")
	cmd.Stdin = os.Stdin
	cmd.Run()
}

func hideCursor() {
	fmt.Print("\033[?25l")
}

func showCursor() {
	fmt.Print("\033[?25h")
}

func clearScreen() {
	fmt.Print("\033[2J\033[H")
}



// Styles for the interactive selection
var (
	selectedItemStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#000000")).
				Background(primaryColor).
				Bold(true).
				Padding(0, 2).
				Margin(0, 1)

	unselectedItemStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Padding(0, 2).
				Margin(0, 1)

	itemDescriptionStyle = lipgloss.NewStyle().
				Foreground(mutedColor).
				Italic(true).
				PaddingLeft(4)

	instructionStyle = lipgloss.NewStyle().
				Foreground(mutedColor).
				Italic(true).
				Margin(1, 0)

	headerStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(primaryColor).
			Padding(1, 2).
			Margin(1, 0)
)

func SelectFromList(items []SelectionItem, itemType string) (*SelectionItem, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("no %s available", itemType)
	}

	if len(items) == 1 {
		PrintInfo(fmt.Sprintf("Found 1 %s: %s", itemType, items[0].Name))
		return &items[0], nil
	}

	return interactiveSelect(items, itemType)
}

func interactiveSelect(items []SelectionItem, itemType string) (*SelectionItem, error) {
	selectedIndex := 0
	
	// Enable raw mode for key detection
	_, err := enableRawMode()
	if err != nil {
		// Fallback to simple numbered selection if raw mode fails
		return fallbackSelect(items, itemType)
	}
	defer disableRawMode()
	
	hideCursor()
	defer showCursor()

	for {
		clearScreen()
		renderSelection(items, itemType, selectedIndex)
		
		// Read single character input
		var b [1]byte
		os.Stdin.Read(b[:])
		
		switch b[0] {
		case 27: // ESC sequence
			// Read the next two characters for arrow keys
			var seq [2]byte
			os.Stdin.Read(seq[:])
			if seq[0] == 91 { // '['
				switch seq[1] {
				case 65: // Up arrow
					if selectedIndex > 0 {
						selectedIndex--
					}
				case 66: // Down arrow
					if selectedIndex < len(items)-1 {
						selectedIndex++
					}
				}
			}
		case 13, 10: // Enter
			clearScreen()
			selected := &items[selectedIndex]
			PrintSuccess(fmt.Sprintf("Selected %s: %s (%s)", itemType, selected.Name, selected.Slug))
			return selected, nil
		case 'y', 'Y': // Y key
			clearScreen()
			selected := &items[selectedIndex]
			PrintSuccess(fmt.Sprintf("Selected %s: %s (%s)", itemType, selected.Name, selected.Slug))
			return selected, nil
		case 'q', 'Q', 3: // Q key or Ctrl+C
			clearScreen()
			return nil, fmt.Errorf("selection cancelled")
		}
	}
}

func renderSelection(items []SelectionItem, itemType string, selectedIndex int) {
	// Header
	header := fmt.Sprintf("Select %s", capitalize(itemType))
	fmt.Println(headerStyle.Render(header))
	
	// Instructions
	instructions := "Use ↑/↓ to navigate • Enter or Y to select • Q to quit"
	fmt.Println(instructionStyle.Render(instructions))
	fmt.Println()
	
	// Items
	for i, item := range items {
		var itemLine string
		var descLine string
		
		if i == selectedIndex {
			itemLine = selectedItemStyle.Render(fmt.Sprintf("● %s (%s)", item.Name, item.Slug))
		} else {
			itemLine = unselectedItemStyle.Render(fmt.Sprintf("  %s (%s)", item.Name, item.Slug))
		}
		
		fmt.Println(itemLine)
		
		if item.Description != "" {
			if i == selectedIndex {
				descLine = itemDescriptionStyle.Render(fmt.Sprintf("   %s", item.Description))
			} else {
				descLine = itemDescriptionStyle.Render(fmt.Sprintf("   %s", item.Description))
			}
			fmt.Println(descLine)
		}
		fmt.Println()
	}
}

// Fallback to numbered selection if raw mode fails
func fallbackSelect(items []SelectionItem, itemType string) (*SelectionItem, error) {
	PrintTitle(fmt.Sprintf("Select %s", capitalize(itemType)))
	PrintInfo(fmt.Sprintf("Found %d %s:", len(items), itemType))

	for i, item := range items {
		description := ""
		if item.Description != "" {
			description = fmt.Sprintf(" - %s", item.Description)
		}
		PrintInfo(fmt.Sprintf("%d. %s (%s)%s", i+1, item.Name, item.Slug, description))
	}

	for {
		fmt.Print("\nEnter your choice (1-" + fmt.Sprintf("%d", len(items)) + "): ")
		var input string
		fmt.Scanln(&input)

		if choice := parseChoice(input, len(items)); choice >= 0 {
			selected := &items[choice]
			PrintSuccess(fmt.Sprintf("Selected %s: %s (%s)", itemType, selected.Name, selected.Slug))
			return selected, nil
		}
		PrintError(fmt.Sprintf("Invalid choice. Please enter a number between 1 and %d", len(items)))
	}
}

func parseChoice(input string, maxItems int) int {
	input = strings.TrimSpace(input)
	if input == "" {
		return -1
	}
	
	var choice int
	if n, err := fmt.Sscanf(input, "%d", &choice); n == 1 && err == nil {
		if choice >= 1 && choice <= maxItems {
			return choice - 1
		}
	}
	return -1
}

func ShowProgress(step int, total int, message string) {
	PrintInfo(fmt.Sprintf("[%d/%d] %s", step, total, message))
}
