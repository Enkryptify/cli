_ek() {
  local cur
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  
  local cmd="${COMP_WORDS[0]}"
  mapfile -t COMPREPLY < <($cmd __complete "${COMP_WORDS[@]:1}")
}

complete -F _ek ek ek-darwin-arm64 ek-darwin-x64 ek-linux-arm64 ek-linux-x64 ek-win-x64 ek-win-arm64
