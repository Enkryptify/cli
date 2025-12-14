#compdef ek

_ek() {
  local -a suggestions
  suggestions=("${(@f)$(ek __complete ${words[2,-1]})}")
  _describe 'values' suggestions
}

compdef _ek ek


