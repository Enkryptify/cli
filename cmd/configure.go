package cmd

import (
	"fmt"
	"os"
	"strconv"

	"github.com/Enkryptify/cli/api"
	"github.com/Enkryptify/cli/ui/selectInput"
	"github.com/Enkryptify/cli/utils/config"
	"github.com/Enkryptify/cli/utils/keys"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

func init() {
	rootCmd.AddCommand(configureCmd)
}

var configureCmd = &cobra.Command{
	Use:   "configure",
	Short: "Configure your project",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		_, err := keys.GetAPIKey()
		if err != nil {
			fmt.Println("No API key found")
		}

		// client := api.NewClient(key)
		// ctx := context.Background()

		// Ask for workspace
		var workspaces api.WorkspaceResponse = api.WorkspaceResponse{
			Data: []api.Workspace{
				{
					ID:   1,
					Name: "Workspace 1",
				},
			},
		}
		// if err := client.GetWorkspaces(ctx, &workspaces); err != nil {
		// 	fmt.Printf("Invalid API key: %v\n", err)
		// 	return
		// }

		var workspaceSelection selectInput.Selection
		if len(workspaces.Data) == 0 {
			fmt.Println("No workspaces found")
			return
		} else if len(workspaces.Data) > 1 {
			workspaceOptions := make([]selectInput.Item, len(workspaces.Data))
			for i, workspace := range workspaces.Data {
				workspaceOptions[i] = selectInput.Item{Title: workspace.Name, ID: strconv.Itoa(workspace.ID)}
			}

			workspaceModel := selectInput.InitialModel(workspaceOptions, &workspaceSelection, "Select a workspace")
			if _, err := tea.NewProgram(workspaceModel).Run(); err != nil {
				fmt.Printf("Error selecting workspace: %v\n", err)
				return
			}
		} else {
			workspaceSelection.Choice = strconv.Itoa(workspaces.Data[0].ID)
		}

		var projects api.ProjectResponse = api.ProjectResponse{
			Data: []api.Project{
				{
					ID:   1,
					Name: "Project 1",
				},
			},
		}
		// if err := client.GetProjects(ctx, workspaceSelection.Choice, &projects); err != nil {
		// 	fmt.Printf("Invalid API key: %v\n", err)
		// 	return
		// }

		projectOptions := make([]selectInput.Item, len(projects.Data))
		for i, project := range projects.Data {
			projectOptions[i] = selectInput.Item{Title: project.Name, ID: strconv.Itoa(project.ID)}
		}

		var projectSelection selectInput.Selection
		projectModel := selectInput.InitialModel(projectOptions, &projectSelection, "Select a project")
		if _, err := tea.NewProgram(projectModel).Run(); err != nil {
			fmt.Printf("Error selecting project: %v\n", err)
			return
		}

		var projectKey api.ProjectKeyResponse = api.ProjectKeyResponse{
			Data: api.ProjectKey{
				ID:        1,
				Key:       "project-key-xyz",
				PublicKey: "public-key-xyz",
			},
		}
		// if err := client.GetProjectKey(ctx, projectSelection.Choice, &projectKey); err != nil {
		// 	fmt.Printf("Invalid API key: %v\n", err)
		// 	return
		// }

		var environments api.EnvironmentResponse = api.EnvironmentResponse{
			Data: []api.Environment{
				{
					ID:   1,
					Name: "Environment 1",
				},
			},
		}
		// if err := client.GetEnvironments(ctx, projectSelection.Choice, &environments); err != nil {
		// 	fmt.Printf("Invalid API key: %v\n", err)
		// 	return
		// }

		environmentOptions := make([]selectInput.Item, len(environments.Data))
		for i, environment := range environments.Data {
			environmentOptions[i] = selectInput.Item{Title: environment.Name, ID: strconv.Itoa(environment.ID)}
		}

		var environmentSelection selectInput.Selection
		environmentModel := selectInput.InitialModel(environmentOptions, &environmentSelection, "Select an environment")
		if _, err := tea.NewProgram(environmentModel).Run(); err != nil {
			fmt.Printf("Error selecting environment: %v\n", err)
			return
		}

		cwd, err := os.Getwd()
		if err != nil {
			fmt.Printf("Error getting current directory: %v\n", err)
			return
		}

		cm, err := config.NewConfigManager()
		if err != nil {
			fmt.Printf("Error creating config manager: %v\n", err)
			return
		}

		config := config.Config{
			WorkspaceID:   workspaceSelection.Choice,
			ProjectID:     projectSelection.Choice,
			EnvironmentID: environmentSelection.Choice,
			PublicKey:     projectKey.Data.PublicKey,
			DirectoryPath: cwd,
		}
		encryptedProjectKey := projectKey.Data.Key

		if err := cm.SetConfig(config, encryptedProjectKey); err != nil {
			fmt.Printf("Error adding config: %v\n", err)
			return
		}

		fmt.Println("Configuration saved successfully")
	},
}
