Register-ArgumentCompleter -CommandName ek -ScriptBlock {
  param(
      $wordToComplete,
      $commandAst,
      $cursorPosition
  )

  $args = $commandAst.CommandElements |
      Select-Object -Skip 1 |
      ForEach-Object { $_.ToString() }

  $results = & ek __complete @args 2>$null

  foreach ($r in $results) {
      if ($r -like "$wordToComplete*") {
          [System.Management.Automation.CompletionResult]::new(
              $r,
              $r,
              'ParameterValue',
              $r
          )
      }
  }
}
