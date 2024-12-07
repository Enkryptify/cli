package selectInput

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	titleStyle        = lipgloss.NewStyle().Background(lipgloss.Color("#0371E4")).Foreground(lipgloss.Color("#FFFFFF")).Bold(true).Padding(0, 1, 0)
	focusedStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("#FFFFFF")).Bold(true)
	selectedItemStyle = lipgloss.NewStyle().PaddingLeft(1).Foreground(lipgloss.Color("#0371E4")).Bold(true)
	idStyle           = lipgloss.NewStyle().Foreground(lipgloss.Color("#797979"))
)

type Item struct {
	Title, ID string
}

type Selection struct {
	Choice string
}

func (s *Selection) Update(value string) {
	s.Choice = value
}

type model struct {
	cursor   int
	choices  []Item
	selected map[int]struct{}
	choice   *Selection
	header   string
	exit     *bool
}

func (m model) Init() tea.Cmd {
	return nil
}

func InitialModel(choices []Item, selection *Selection, header string) model {
	return model{
		choices:  choices,
		selected: make(map[int]struct{}),
		choice:   selection,
		header:   titleStyle.Render(header),
	}
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			*m.exit = true
			return m, tea.Quit
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}
		case "down", "j":
			if m.cursor < len(m.choices)-1 {
				m.cursor++
			}
		case "enter", " ":
			if len(m.selected) == 1 {
				m.selected = make(map[int]struct{})
			}
			_, ok := m.selected[m.cursor]
			if ok {
				delete(m.selected, m.cursor)
			} else {
				m.selected[m.cursor] = struct{}{}
			}
		case "y":
			if len(m.selected) == 1 {
				for selectedKey := range m.selected {
					m.choice.Update(m.choices[selectedKey].ID)
					m.cursor = selectedKey
				}
				return m, tea.Quit
			}
		}
	}
	return m, nil
}

func (m model) View() string {
	s := m.header + "\n\n"

	for i, choice := range m.choices {
		cursor := " "
		if m.cursor == i {
			cursor = focusedStyle.Render(">")
			choice.Title = selectedItemStyle.Render(choice.Title)
			choice.ID = selectedItemStyle.Render(choice.ID)
		}

		checked := " "
		if _, ok := m.selected[i]; ok {
			checked = focusedStyle.Render("x")
		}

		title := focusedStyle.Render(choice.Title)
		id := idStyle.Render(fmt.Sprintf("(ID: %s)", choice.ID))

		s += fmt.Sprintf("%s [%s] %s %s\n\n", cursor, checked, title, id)
	}

	s += fmt.Sprintf("Press %s to select, press %s to confirm choice.\n", focusedStyle.Render("space"), focusedStyle.Render("y"))
	return s
}
