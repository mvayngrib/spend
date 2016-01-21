var assert = require('assert')
var dezalgo = require('dezalgo')
var bitcoin = require('@tradle/bitcoinjs-lib')
var toSatoshis = require('./toSatoshis')
var noop = function() {}

// fixed for now
var FEE = 10000 // 100 bits
var MIN_CONFIRMATIONS = 1

function Spender (network) {
  if (!(this instanceof Spender)) return new Spender()

  this.network = typeof network === 'string' ? bitcoin.networks[network] : network
  assert(this.network, 'specify "network"')
  this.sends = []
}

module.exports = Spender
Spender.SPLIT_CHANGE = true

Spender.prototype.from = function (key) {
  assert(key, 'specify "key"')
  this.key = typeof key === 'string' ? bitcoin.ECKey.fromWIF(key) : key
  return this
}

Spender.prototype.blockchain = function (chain) {
  this.chain = chain
  return this
}

Spender.prototype.to = function (toAddress, satoshis) {
  assert(toAddress, 'specify "toAddress"')
  assert(satoshis, 'specify "satoshis"')

  this.sends.push({
    to: toAddress,
    amount: satoshis
  })

  return this
}

Spender.prototype.change = function (changeAddress) {
  this.changeAddress = typeof changeAddress === 'string' ?
    changeAddress :
    changeAddress.toString()

  return this
}

Spender.prototype.data = function (data) {
  this.data = data
  return this
}

Spender.prototype.fee = function(satoshis) {
  this.feeAmount = satoshis
  return this
}

Spender.prototype.build = function(cb) {
  var self = this

  assert(this.to.length, 'specify "to"')
  assert(this.network, 'specify "net"')
  assert(this.chain, 'specify "blockchain"')

  cb = dezalgo(cb || noop)
  if (this._building) {
    return cb(new Error('build can only be called once'))
  }

  this._building = true
  var key = this.key
  var amount = this.sends.reduce(function(sum, send) {
    return sum + send.amount
  }, 0)

  var fee = this.feeAmount || FEE
  var myAddr = key.pub.getAddress(this.network).toString()
  var changeAddress = this.changeAddress || myAddr
  var sends = this.sends
  var data = this.data
  var chain = this.chain

  this.chain.addresses.unspents(myAddr, function (err, utxos) {
    if (err) return cb(err)

    utxos = utxos.filter(function (u) {
      // otherwise tx will fail
      return (u.confirmations || 0) >= MIN_CONFIRMATIONS
    })

    utxos.forEach(function(u) {
      if (typeof u.value === 'string') {
        // cb-blockr, i'm looking for you
        u.value = toSatoshis(u.value)
      }
    })

    var needed = amount + fee
    var collected = 0
    utxos = shuffle(utxos)
      .filter(function(u) {
        if (collected < needed) {
          collected += u.value
          return true
        }
      })

    if (needed > collected) {
      return cb(new Error("Address doesn't contain enough money to send."))
    }

    var change = collected - needed
    var tx = new bitcoin.TransactionBuilder()
    sends.forEach(function(send) {
      tx.addOutput(send.to, send.amount)
    })

    if (change > 0) {
      // hack for now to split change
      if (Spender.SPLIT_CHANGE && changeAddress === myAddr && sends.length === 1 && change > 200000) {
        tx.addOutput(changeAddress, change / 2 | 0)
        tx.addOutput(changeAddress, change / 2 | 0)
      } else {
        tx.addOutput(changeAddress, change)
      }
    }

    if (data) {
      tx.addOutput(bitcoin.scripts.nullDataOutput(data), 0)
    }

    utxos.forEach(function (unspent) {
      tx.addInput(unspent.txId, unspent.vout)
    })

    for (var i = 0; i < utxos.length; i++) {
      tx.sign(i, key)
    }

    tx = tx.build()

    delete self._building
    self.tx = tx
    self.usedUnspents = utxos
    cb(null, tx, utxos)
  })
}

Spender.prototype.execute = function (cb) {
  var self = this
  cb = dezalgo(cb || noop)

  if (this._spending) {
    return cb(new Error('spend can only be called once'))
  }

  this._spending = true
  if (this.tx) return this._spend()

  if (this._building) throw new Error('still building')

  this.build(function(err) {
    if (err) return cb(err)

    self._spend(cb)
  })
}

Spender.prototype._spend = function (cb) {
  var self = this
  this.chain.transactions.propagate(this.tx.toHex(), function (err) {
    cb(err, self.tx, self.usedUnspents)
  })
}

// fisher-yates
// http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffle (array) {
  var currentIndex = array.length, temporaryValue, randomIndex

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex -= 1

    // And swap it with the current element.
    temporaryValue = array[currentIndex]
    array[currentIndex] = array[randomIndex]
    array[randomIndex] = temporaryValue
  }

  return array
}
