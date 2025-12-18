_ek_complete() {
  local -a suggestions
  local cmd="${words[1]}"
  suggestions=("${(@f)$($cmd __complete ${words[2,-1]})}")
  _describe 'values' suggestions
}

compdef _ek_complete ek ek-darwin-arm64 ek-darwin-x64 ek-linux-arm64 ek-linux-x64 ek-win-x64 ek-win-arm64

