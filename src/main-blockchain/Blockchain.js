import MainBlockchainWallet from 'main-blockchain/wallet/Main-Blockchain-Wallet';
import MainBlockchain from 'main-blockchain/chain/Main-Blockchain';
import MainBlockchainMining from 'main-blockchain/mining/Main-Blockchain-Mining';
import MainBlockchainAgent from 'main-blockchain/agents/Main-Blockchain-Agent';
import MainBlockchainBalances from "main-blockchain/balances/Main-Blockchain-Balances";
import ValidationsUtils from "common/utils/validation/Validations-Utils";
import NodesList from 'node/lists/Nodes-List';
import StatusEvents from "common/events/Status-Events";
import NodesWaitlist from 'node/lists/waitlist/Nodes-Waitlist';
import WebDollarCrypto from "common/crypto/WebDollar-Crypto";
import NODES_TYPE from "../node/lists/types/Nodes-Type";

import PoolManagement from "common/mining-pools/pool/pool-management/Pool-Management"
import MinerPoolManagement from "common/mining-pools/miner/miner-pool/Miner-Pool-Management"

class Blockchain{

    constructor(){

        this._startMiningNextTimeSynchronized = false;
        this._blockchainInitiated = false;

        this._walletLoaded = false;

        this.Chain = new MainBlockchain( undefined );
        this.blockchain = this.Chain;

        this._synchronized = undefined;

        this.Wallet = new MainBlockchainWallet(this.Chain);

        this.Mining = new MainBlockchainMining(this.Chain, undefined);

        this.Transactions = this.Chain.transactions;
        this.Transactions.setWallet(this.Wallet);

        this.Balances = new MainBlockchainBalances(this.Chain);

        this.AccountantTree = this.Chain.accountantTree;

        this.onLoaded = new Promise((resolve)=>{
            this._onLoadedResolver = resolve;
        });

        this.PoolManagement = new PoolManagement(this.Wallet);
        this.MinerPoolManagement = new MinerPoolManagement();

        this.onLoaded.then( async (answer)=>{
            await this.PoolManagement.initializePoolManagement();
            await this.MinerPoolManagement.initializeMinerPoolManagement();
        });
        
        this._loaded = false;

    }

    async createBlockchain(agentName, afterBlockchainLoadCallback, afterSynchronizationCallback){

        this._blockchainInitiated = true;

        this.Agent = MainBlockchainAgent.createAgent(agentName, this.blockchain);
        this.Agent.setBlockchain(this.blockchain);

        this.blockchain._setAgent(this.Agent);

        //Waiting Until a Single Window is present
        let validation;
        try {

            validation = new ValidationsUtils();

            await validation.validate();

        } catch (exception){

        }

        await validation.waitSingleTab( () => {
            StatusEvents.emit('blockchain/status', {message: "Multiple Windows Detected"});
        });
        StatusEvents.emit('blockchain/status', {message: "Single Window"});


        await this.initializeBlockchain( afterBlockchainLoadCallback, afterSynchronizationCallback );

    }

    async loadWallet(){

        if (!this._walletLoaded) {
            await this.Wallet.loadWallet();

            //starting mining
            await this.Mining.loadMinerAddress(this.Wallet.addresses[0], this.Wallet);

            this._walletLoaded = true;
        }
    }

    async initializeBlockchain(afterBlockchainLoadCallback, afterSynchronizationCallback){

        await this.loadWallet();

        if (process.env.BROWSER) { //let's make a hash first

            StatusEvents.emit('blockchain/status', {message: "Loading Hashing Function"});
            await WebDollarCrypto.hashPOW(Buffer(32));
            StatusEvents.emit('blockchain/status', {message: "Successfully Hash Function Loaded"});

        }

        //loading the blockchain
        let blockchainLoaded = await this.loadBlockchain();

        if (typeof afterBlockchainLoadCallback === "function")
            afterBlockchainLoadCallback();

        await this.Agent.initializeStartAgentOnce();

        if (process.env.BROWSER || !blockchainLoaded) {
            //it tries synchronizing multiple times
            await this.synchronizeBlockchain(true);
        } else {
            this.synchronized = true;
        }

        if (typeof afterSynchronizationCallback === "function")
            afterSynchronizationCallback();

        this.loaded = true;
    }

    async startMining(){
        if (process.env.START_MINING || this._startMiningNextTimeSynchronized)
            this.Mining.startMining();
    }

    async startMiningInstantly(){
        this.Mining.startMining();
    }

    async loadBlockchain(){

        StatusEvents.emit('blockchain/status', {message: "Blockchain Loading"});

        let chainLoaded = await this.Chain.loadBlockchain();

        StatusEvents.emit('blockchain/status', {message: "Blockchain Loaded Successfully"});
        return chainLoaded;

    }

    /**
     * it tries synchronizing multiple times
     * @returns {Promise.<void>}
     */
    async synchronizeBlockchain(firstTime, synchronizeComplete=false){

        if (this.synchronized === false) return;

        this.synchronized = false;
        console.warn("################### RESYNCHRONIZATION STARTED ##########");

        let suspendMining = false;
        if (!this.blockchain.light || (this.blockchain.light && NodesList.nodes.length <= 0))
            suspendMining = true;

        if (suspendMining) {
            StatusEvents.emit('blockchain/status', {message: "Start Synchronizing"});
            this.Mining.stopMining();
        }

        while (!this.synchronized){

            StatusEvents.emit('blockchain/status', {message: "Synchronizing"});

            let resultAgentStarted = await this.Agent.startAgent(firstTime, synchronizeComplete);
            firstTime = false;

            if (resultAgentStarted.result){

                StatusEvents.emit('blockchain/status', {message: "Synchronization Successful"});
                this.synchronized = true;

            } else {

                if (firstTime)
                    StatusEvents.emit('blockchain/status', { message: "Error Synchronizing" });
                else
                    StatusEvents.emit('blockchain/status', {message: "No Internet Access"});

                if (NodesList.nodes.length === 0)
                    NodesWaitlist.resetWaitlist(NODES_TYPE.NODE_WEB_PEER);

                this.Agent.initializeAgentPromise();
            }

        }

        this.synchronized = true;
        console.warn( "Blockchain Ready to Mine" );

        if (suspendMining) {
            this.startMining();
            StatusEvents.emit('blockchain/status', {message: "Blockchain Ready to Mine"});
        }

    }

    get loaded(){
        return this._loaded;
    }

    set loaded(newValue){
        this._loaded = newValue;
        this._onLoadedResolver(newValue);
    }

    set startMiningNextTimeSynchronized(newValue){
        this._startMiningNextTimeSynchronized = newValue;

        if (newValue && this.synchronized)
            this.startMining();
    }

    get synchronized(){
        return this._synchronized;
    }

    set synchronized(newValue){
        this._synchronized = newValue;

        StatusEvents.emit('blockchain/synchronizing', !newValue );
        StatusEvents.emit('blockchain/synchronized', newValue );

    }

}

export default new Blockchain()