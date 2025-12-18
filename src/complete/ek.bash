_ek() {
  local cur
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"

  mapfile -t COMPREPLY < <(ek __complete "${COMP_WORDS[@]:1}")
}

complete -F _ek ek
