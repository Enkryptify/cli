package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Enkryptify/cli/internal/config"
	"github.com/Enkryptify/cli/internal/providers/enkryptify"
	"github.com/Enkryptify/cli/internal/ui"
)

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Link current directory to an Enkryptify repository",
	Long: `Link the current git repository to an Enkryptify workspace, project, and environment.

This command will guide you through selecting:
1. A workspace from your available workspaces
2. A project from the selected workspace  
3. An environment from the selected project

The configuration will be saved to ~/.enkryptify/config.json and associated with the current directory path.`,
	
	RunE: runSetup,
}

func init() {
	rootCmd.AddCommand(setupCmd)
}

func runSetup(cmd *cobra.Command, args []string) error {
	if err := ValidateAuthentication(); err != nil {
		ui.PrintError("You must be authenticated to run setup")
		ui.PrintInfo("Please run 'ek login' first")
		return err
	}

	ui.ShowBrandHeader()
	ui.PrintTitle("🔗 Enkryptify Repository Setup")

	currentPath, err := config.GetCurrentWorkingDirectory()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %w", err)
	}

	setupStorage, err := config.LoadSetupStorage()
	if err != nil {
		return fmt.Errorf("failed to load setup configuration: %w", err)
	}

	if setupStorage.HasSetupForPath(currentPath) {
		existingSetup := setupStorage.GetSetupForPath(currentPath)
		ui.PrintWarning("Setup already exists for this directory")
		ui.PrintInfo(fmt.Sprintf("Current setup: workspace=%s, project=%s, environment=%s", 
			existingSetup.WorkspaceSlug, existingSetup.ProjectSlug, existingSetup.EnvironmentID))
		
		if !ui.ConfirmAction("Do you want to overwrite the existing setup?") {
			ui.PrintInfo("Setup cancelled")
			return nil
		}
	}

	client := enkryptify.NewClient()

	ui.ShowProgress(1, 3, "Fetching workspaces...")
	workspaces, err := client.GetWorkspaces()
	if err != nil {
		return fmt.Errorf("failed to fetch workspaces: %w", err)
	}

	if len(workspaces) == 0 {
		ui.PrintError("No workspaces found")
		ui.PrintInfo("Please create a workspace in Enkryptify first")
		return fmt.Errorf("no workspaces available")
	}

	workspaceItems := make([]ui.SelectionItem, len(workspaces))
	for i, ws := range workspaces {
		workspaceItems[i] = ui.SelectionItem{
			ID:          ws.ID,
			Name:        ws.Name,
			Slug:        ws.Slug,
		}
	}

	selectedWorkspace, err := ui.SelectFromList(workspaceItems, "workspace")
	if err != nil {
		return err
	}

	ui.ShowProgress(2, 3, "Fetching projects...")
	projects, err := client.GetProjects(selectedWorkspace.Slug)
	if err != nil {
		return fmt.Errorf("failed to fetch projects: %w", err)
	}

	if len(projects) == 0 {
		ui.PrintError("No projects found in the selected workspace")
		ui.PrintInfo("Please create a project in this workspace first")
		return fmt.Errorf("no projects available")
	}

	projectItems := make([]ui.SelectionItem, len(projects))
	for i, proj := range projects {
		projectItems[i] = ui.SelectionItem{
			ID:          proj.ID,
			Name:        proj.Name,
			Slug:        proj.Slug,
		}
	}

	selectedProject, err := ui.SelectFromList(projectItems, "project")
	if err != nil {
		return err
	}

	ui.ShowProgress(3, 3, "Fetching environments...")
	projectDetail, err := client.GetProjectDetail(selectedWorkspace.Slug, selectedProject.Slug)
	if err != nil {
		return fmt.Errorf("failed to fetch project detail: %w", err)
	}

	if len(projectDetail.Environments) == 0 {
		ui.PrintError("No environments found in the selected project")
		ui.PrintInfo("Please create an environment in this project first")
		return fmt.Errorf("no environments available")
	}

	environmentItems := make([]ui.SelectionItem, len(projectDetail.Environments))
	for i, env := range projectDetail.Environments {
		environmentItems[i] = ui.SelectionItem{
			ID:          env.ID,
			Name:        env.Name,

		}
	}

	selectedEnvironment, err := ui.SelectFromList(environmentItems, "environment")
	if err != nil {
		return err
	}

	setupConfig := config.SetupConfig{
		Path:          currentPath,
		WorkspaceSlug: selectedWorkspace.Slug,
		ProjectSlug:   selectedProject.Slug,
		EnvironmentID: selectedEnvironment.ID,
	}

	setupStorage.AddOrUpdateSetup(setupConfig)
	if err := setupStorage.Save(); err != nil {
		return fmt.Errorf("failed to save setup configuration: %w", err)
	}

	ui.PrintSeparator()
	ui.PrintSuccess("Setup completed successfully!")
	ui.PrintInfo(fmt.Sprintf("Workspace: %s (%s)", selectedWorkspace.Name, selectedWorkspace.Slug))
	ui.PrintInfo(fmt.Sprintf("Project: %s (%s)", selectedProject.Name, selectedProject.Slug))
	ui.PrintInfo(fmt.Sprintf("Environment: %s", selectedEnvironment.Name))
	ui.PrintInfo(fmt.Sprintf("Path: %s", currentPath))

	return nil
}
