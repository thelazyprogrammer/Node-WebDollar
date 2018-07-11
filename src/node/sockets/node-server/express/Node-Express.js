import BlockchainGenesis from 'common/blockchain/global/Blockchain-Genesis'
import InterfaceBlockchainAddressHelper from "common/blockchain/interface-blockchain/addresses/Interface-Blockchain-Address-Helper";

const https = require('https');
const compression = require('compression');
const http = require('http');
const path = require('path')
const express = require('express')
const cors = require('cors');
const fs = require('fs')
import consts from 'consts/const_global'

import NodeAPIRouter from "../API-router/Node-API-Router"
import NODE_API_TYPE from "../API-router/NODE_API_TYPE";

import NodeServerSocketAPI from "../sockets/Node-Server-Socket-API"; //required because it will process the SocketAPI



import Blockchain from "main-blockchain/Blockchain"
import NodesList from 'node/lists/Nodes-List'
import WebDollarCoins from "common/utils/coins/WebDollar-Coins"

var BigNumber = require ('bignumber.js');



class NodeExpress{

    constructor(){

        this.loaded = false;
        this.app = undefined;

        this.SSL = false;
        this.port = 0;
        this.domain = '';

    }

    _extractDomain( fileName ){

        const x509 = require('x509');
        let subject = x509.getSubject( fileName );

        let domain = subject.commonName;

        if (domain === undefined) domain = '';

        domain = domain.replace( "*.", "" );

        return domain;
    }

    _serializeBlock(raw_block) {
      let timestamp = new Date((raw_block.timeStamp + BlockchainGenesis.timeStamp) * 1000)
      console.log(raw_block.timeStamp)
      console.log(BlockchainGenesis.timeStamp)
      timestamp = timestamp.toUTCString()
      let transactions = []
      if (raw_block.data.transactions) {
        for (let j = 0; j < raw_block.data.transactions.transactions.length; j++) {
          transactions.push(raw_block.data.transactions.transactions[j].toJSON())
        }
      }

      let block = {
        id:            raw_block.height,
        block_id:      raw_block.height,
        miner_address: raw_block.data.minerAddress.toString('hex'),
        nonce:         raw_block.nonce,
        hash:          raw_block.hash.toString('hex'),
        previous_hash: raw_block.hashPrev.toString('hex'),
        timestamp:     timestamp,
        raw_timestamp: raw_block.timeStamp,
        reward:        raw_block.reward,
        trxs:          transactions,
        trxs_number:   raw_block.data.transactions.length,
        version:       raw_block.version
      }
      return block
    }

    startExpress(){

        if (this.loaded) //already open
            return;

        return new Promise((resolve)=>{

            this.app = express();
            this.app.use(cors({ credentials: true }));
            this.app.use(compression());

            try {
                this.app.use('/.well-known/acme-challenge', express.static('certificates/well-known/acme-challenge'))
            } catch (exception){

                console.error("Couldn't read the SSL certificates");

            }

            let options = {};

            this.port = process.env.PORT || process.env.SERVER_PORT || consts.SETTINGS.NODE.PORT;

            this.loaded = true;

            try {

                if (!consts.SETTINGS.NODE.SSL) throw {message: "no ssl"};

                this.domain = process.env.DOMAIN;

                let privateKey='', privateKeys = ["private.key","privateKey","private.crt"];
                for (let i=0; i<privateKeys.length; i++)
                    if (fs.existsSync(`./certificates/${privateKeys[i]}`)){
                        privateKey = `./certificates/${privateKeys[i]}`;
                        break;
                    }

                let cert = '', certificates = ["certificate.crt", "crt.crt", "certificate"];
                for (let i=0; i<certificates.length; i++)
                    if (fs.existsSync(`./certificates/${certificates[i]}`)){
                        cert = `./certificates/${certificates[i]}`;
                        break;
                    }

                let caBundle = '', certificateBundles = ["ca_bundle.crt", "bundle.crt", "ca_bundle"];
                for (let i=0; i<certificateBundles.length; i++)
                    if (fs.existsSync(`./certificates/${certificateBundles[i]}`)){
                        caBundle = `./certificates/${certificateBundles[i]}`;
                        break;
                    }

                if (privateKey === '') throw {message: "private.key was not found"};
                if (cert === '') throw {message: "certificate.crt was not found"};
                if (caBundle === '') throw {message: "ca_bundle.crt was not found"};

                try {
                    if (this.domain === undefined || this.domain === "undefined") this.domain = this._extractDomain(cert);
                } catch (exception){
                    console.error("Couldn't determine the SSL Certificate Host Name");
                }

                options.key = fs.readFileSync(privateKey, 'utf8');
                options.cert = fs.readFileSync(cert, 'utf8');
                options.caBundle = fs.readFileSync(caBundle, 'utf8');

                this.server = https.createServer(options, this.app).listen( this.port, ()=>{

                    console.info("========================================");
                    console.info("SSL certificate found for ", this.domain||'domain.com');

                    if (this.domain === '')
                        console.error("Your domain from certificate was not recognized");


                    this.SSL = true;

                    this._initializeRouter(this.app);

                    console.info("========================================");
                    console.info("HTTPS Express was opened on port "+ this.port);
                    console.info("========================================");

                    resolve(true);

                }).on('error',  (err) => {

                    console.error("Error Creating HTTPS Express Server");
                    console.error(err);

                    throw err;

                });

            } catch (exception){

                console.error("HTTP Express raised an error", exception);

                //cloudflare generates its own SSL certificate
                this.server = http.createServer(this.app).listen(this.port, () => {

                    this.domain = 'my-ip';

                    console.info("========================================");
                    console.info(`Express started at localhost: ${this.port}`);
                    console.info("========================================");

                    consts.SETTINGS.PARAMS.CONNECTIONS.TERMINAL.SERVER.MAXIMUM_CONNECTIONS_FROM_TERMINAL = consts.SETTINGS.PARAMS.CONNECTIONS.TERMINAL.SERVER.MAXIMUM_CONNECTIONS_FROM_TERMINAL + consts.SETTINGS.PARAMS.CONNECTIONS.TERMINAL.SERVER.MAXIMUM_CONNECTIONS_FROM_BROWSER;

                    this._initializeRouter(this.app);

                    resolve(true);

                }).on('error', (err) => {

                    this.domain = '';

                    console.error("Error Creating Express Server");
                    console.error(err);

                    resolve(false);

                });


            }

        })
    }

    _initializeRouter(app){
// respond with "hello world" when a GET request is made to the homepage
        this.app.get('/', (req, res) => {

            let lastBlock = Blockchain.blockchain.blocks.last;

            res.json({

                protocol: consts.SETTINGS.NODE.PROTOCOL,
                version: consts.SETTINGS.NODE.VERSION,
                blocks: {
                    length: Blockchain.blockchain.blocks.length,
                    lastBlockHash: lastBlock !== undefined ? Blockchain.blockchain.blocks.last.hash.toString("hex") : '',
                },
                networkHashRate: Blockchain.blockchain.blocks.networkHashRate,
                sockets:{
                },
                waitlist:{
                }

            });

        });

        // Return blocks information
        this.app.get('/blocks/:blocks', (req, res) => {

          try {
            let block_start = parseInt(decodeURIComponent(req.params.blocks))
            if (block_start < Blockchain.blockchain.blocks.length) {
              let blocks_to_send = []
              for (let i=Blockchain.blockchain.blocks.length - block_start; i<Blockchain.blockchain.blocks.length; i++) {
                blocks_to_send.push(this._serializeBlock(Blockchain.blockchain.blocks[i]))
              }
              res.send({result: true, blocks: blocks_to_send})
              return
            } else {
              throw ("block start is not correct: " + block_start)
            }
          } catch (exception) {
            res.send({result: false, message: exception.message});
            return;
          }
        })


        // Return block information
        this.app.get('/block/:block', (req, res) => {
          try {
            let block = parseInt(decodeURIComponent(req.params.block))
            if (block < Blockchain.blockchain.blocks.length) {
              res.send({
                result: true,
                block: this._serializeBlock(Blockchain.blockchain.blocks[block])
              })
              return;
            } else {
              throw "Block not found."
            }
          } catch (exception) {
            res.send({result: false, message: "Invalid Block"})
            return;
          }
        })


        // Return address info: balance, blocks mined and transactions
        this.app.get('/address/:address', (req, res) => {

            let address = decodeURIComponent(req.params.address);

            try {
                address = InterfaceBlockchainAddressHelper.getUnencodedAddressFromWIF(address);
            } catch (exception){
                res.send({result: false, message: "Invalid Address"});
                return;
            }

            let answer = []
            let minedBlocks = []
            let balance = 0
            let last_block = Blockchain.blockchain.blocks.length

            // Get balance
            balance = Blockchain.blockchain.accountantTree.getBalance(address, undefined);
            balance = (balance === null) ? 0 : (balance / WebDollarCoins.WEBD);

            // Get mined blocks and transactions
            for (let i=0; i<Blockchain.blockchain.blocks.length; i++) {

                for (let j = 0; j < Blockchain.blockchain.blocks[i].data.transactions.transactions.length; j++) {

                    let transaction = Blockchain.blockchain.blocks[i].data.transactions.transactions[j];

                    let found = false;
                    for (let q = 0; q < transaction.from.addresses.length; q++)
                        if (transaction.from.addresses[q].unencodedAddress.equals(address)) {
                            found = true;
                            break;
                        }

                    for (let q = 0; q < transaction.to.addresses.length; q++)
                        if (transaction.to.addresses[q].unencodedAddress.equals(address)) {
                            found = true;
                            break;
                        }

                    if (found) {
                        answer.push(
                            {
                                blockId: Blockchain.blockchain.blocks[i].height,
                                timestamp: Blockchain.blockchain.blocks[i].timeStamp + BlockchainGenesis.timeStamp,
                                transaction: transaction.toJSON()
                            });
                    }

                }
                if (Blockchain.blockchain.blocks[i].data.minerAddress.equals(address)) {
                    minedBlocks.push(
                        {
                            blockId: Blockchain.blockchain.blocks[i].height,
                            timestamp: Blockchain.blockchain.blocks[i].timeStamp + BlockchainGenesis.timeStamp,
                            transactions: Blockchain.blockchain.blocks[i].data.transactions.transactions.length
                        });
                }
            }


            res.send({result: true, last_block: last_block,
                      balance: balance, minedBlocks: minedBlocks,
                      transactions: answer
                     });

        });

        //Get Address
        //TODO: optimize or limit the number of requests
        this.app.get('/wallets/balance/:address', (req, res) => {

            let address = decodeURIComponent(req.params.address);
            let balance = Blockchain.blockchain.accountantTree.getBalance(address, undefined);

            balance = (balance === null) ? 0 : (balance / WebDollarCoins.WEBD);

            res.json(balance);

        });

        if (process.env.WALLET_SECRET_URL && typeof process.env.WALLET_SECRET_URL === "string" && process.env.WALLET_SECRET_URL.length >= 30) {

            this.app.get('/'+process.env.WALLET_SECRET_URL+'/mining/balance', (req, res) => {

                let addressString = Blockchain.blockchain.mining.minerAddress;
                let balance = Blockchain.blockchain.accountantTree.getBalance(addressString, undefined);

                balance = (balance === null) ? 0 : (balance / WebDollarCoins.WEBD);

                res.json(balance);

            });

            this.app.get('/'+process.env.WALLET_SECRET_URL+'/wallets/import', async (req, res) => {

                let content = {
                    version: '0.1',
                    address: decodeURIComponent(req.query.address),
                    publicKey: req.query.publicKey,
                    privateKey: req.query.privateKey
                };

                try {

                    let answer = await Blockchain.Wallet.importAddressFromJSON(content);

                    if (answer.result === true) {
                        console.log("Address successfully imported", answer.address);
                        await Blockchain.Wallet.saveWallet();
                        res.json(true);
                    } else {
                        console.error(answer.message);
                        res.json(false);
                    }

                } catch(err) {
                    console.error(err.message);
                    res.json(false);
                }

            });

            this.app.get('/'+process.env.WALLET_SECRET_URL+'/wallets/transactions', async (req, res) => {

              let from = decodeURIComponent(req.query.from);
              let to = decodeURIComponent(req.query.to);
              let amount = parseInt(req.query.amount) * WebDollarCoins.WEBD;
              let fee = parseInt(req.query.fee) * WebDollarCoins.WEBD;

              let result = await Blockchain.Transactions.wizard.createTransactionSimple(from, to, amount, fee);

              res.json(result);

            });

          this.app.get('/'+process.env.WALLET_SECRET_URL+'/wallets/export', async (req, res) => {
              let addressString = Blockchain.blockchain.mining.minerAddress;
              let answer = await Blockchain.Wallet.exportAddressToJSON(addressString);

              if (answer.data) {
                res.json(answer.data);
              } else {
                res.json({});
              }
          });

        }

        // respond with "hello world" when a GET request is made to the homepage
        this.app.get('/hello', (req, res) => {
            res.send('world');
        });

        // respond with "hello world" when a GET request is made to the homepage
        this.app.get('/ping', (req, res) => {
            res.json( { ping: "pong" });
        });



    }


    amIFallback(){

        for (let i=0; i<NodesWaitlist.waitListFullNodes.length; i++)
            if (NodesWaitlist.waitListFullNodes[i].isFallback && NodesWaitlist.waitListFullNodes[i].sckAddresses[0].address === this.domain)
                return true;

        return false;

    }

    //this will process the params
    async _expressMiddleware(req, res, callback){

        try {
            for (let k in req.params)
                req.params[k] = decodeURIComponent(req.params[k]);

            let answer = await callback(req.params, res);
            res.json(answer);

        } catch (exception){
            res.json({result:false, message: exception.message});
        }

    }

    async _expressMiddlewareCallback(req, res, callback){

        try {
            for (let k in req)
                req[k] = decodeURIComponent(req[k]);

            let url = req.url;

            if (typeof url !== "string") throw {message: "url not specified"};

            let answer = await callback(req, res, (data)=>{ this._notifyHTTPSubscriber(url, data) });
            res.json(answer);

        } catch (exception){
            res.json({result:false, message: exception.message});
        }

    }

    _notifyHTTPSubscriber(url, data){

        //TODO notify via http get/post via axios ?

    }

}

export default new NodeExpress();
