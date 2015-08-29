module.exports = function toSatoshis (n) {
  var idx = n.indexOf('.')
  var expectedLength = idx === -1 ? n.length + 8 : idx + 8 // 1e8 satoshis === 1 btc
  n = n.replace('.', '')
  while (n.length < expectedLength) {
    n += '0'
  }

  return Number(n)
}
