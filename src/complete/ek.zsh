#compdef ek

_ek() {
  local -a completions
  completions=("${(@f)$(ek __complete "${words[@]:1}")}")
  _describe 'values' completions
}
