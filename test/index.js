var assert = require('assert')
// var Blockchain = require('cb-insight')
var extend = require('xtend')
var btcToSatoshis = require('../toSatoshis')
var fixtures = require('./fixtures')
var Spender = require('../')

/* global describe, it */

describe('btcToSatoshis', function () {
  it('should btcToSatoshis satoshi values', function (done) {
    assert.equal(btcToSatoshis('0.10'), 10000000)
    assert.equal(btcToSatoshis('0.00979453'), 979453)
    assert.equal(btcToSatoshis('12.100381'), 1210038100)
    assert.equal(btcToSatoshis('12'), 1200000000)
    done()
  })
})

describe('spend', function () {
  it('should create and submit Bitcoin testnet transaction', function (done) {
    var f0 = extend(fixtures.valid[0])
    f0.utxos = f0.utxos.map(function (u) {
      u = extend(u)
      u.confirmations = 0
      return u
    })

    // stub this out
    new Spender('testnet')
      .from(f0.senderWIF)
      .to(f0.receiver, f0.amount)
      .data(new Buffer('big spender'))
      .blockchain({
        addresses: {
          unspents: function (addresses, callback) {
            callback(null, f0.utxos)
          }
        },
        transactions: {
          propagate: function (rawTx, callback) {
            callback()
          }
        }
      })
      .execute(function (err, tx, utxos) {
        assert(/enough money/.test(err.message))
        done()
      })
  })

  it('it shouldn\'t attempt to spend utxos with no confirmations', function (done) {
    var f0 = extend(fixtures.valid[0])
    f0.utxos = f0.utxos.map(function (u, i) {
      u = extend(u)
      if (i !== 0) u.confirmations = 0
      return u
    })

    // stub this out
    new Spender('testnet')
      .from(f0.senderWIF)
      .to(f0.receiver, f0.amount)
      .data(new Buffer('big spender'))
      .blockchain({
        addresses: {
          unspents: function (addresses, callback) {
            callback(null, f0.utxos)
          }
        },
        transactions: {
          propagate: function (rawTx, callback) {
            callback()
          }
        }
      })
      .execute(function (err, tx, utxos) {
        assert.ifError(err)
        assert.deepEqual(utxos, f0.utxos.slice(0, 1))
        done()
      })
  })
})
