package textInput

import (
	"fmt"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
)

type (
	errMsg error
)

type Output struct {
	Output string
}

func (o Output) update(val string) {
	o.Output = val
}

type model struct {
	textInput textinput.Model
	err       error
	output    *Output
	header    string
}

func InitialModel(output *Output, header string, placeholder string) model {
	ti := textinput.New()
	ti.Placeholder = placeholder
	ti.Focus()
	ti.CharLimit = 156
	ti.Width = 20

	return model{
		textInput: ti,
		err:       nil,
		output:    output,
		header:    header,
	}
}

func (m model) Init() tea.Cmd {
	return textinput.Blink
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEnter:
			if len(m.textInput.Value()) > 0 {
				m.output.Output = m.textInput.Value()
				return m, tea.Quit
			}
		case tea.KeyCtrlC, tea.KeyEsc:
			return m, tea.Quit
		}

	case errMsg:
		m.err = msg
		return m, nil
	}

	m.textInput, cmd = m.textInput.Update(msg)
	return m, cmd
}

func (m model) View() string {
	return fmt.Sprintf("%s\n\n%s\n\n%s",
		m.header,
		m.textInput.View(),
		"(esc to quit)",
	) + "\n"
}
