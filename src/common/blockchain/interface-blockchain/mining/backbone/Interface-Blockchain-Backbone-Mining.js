import InterfaceBlockchainMining from "../Interface-Blockchain-Mining";
import Workers from './Workers';
import consts from 'consts/const_global'

class InterfaceBlockchainBackboneMining extends InterfaceBlockchainMining {


    //backbone mining is the same with InterfaceBlockchainMining

    constructor(blockchain, minerAddress, miningFeePerByte){

        super(blockchain, minerAddress, miningFeePerByte);

        this.WORKER_NONCES_WORK = 700;

        this.block = undefined;
        this.undefined = undefined;
        this._workerResolve = undefined;

        this.end = 0;

        this._workers = new Workers(this);
    }

    async _mineNonces(start, end){

        try {

            if (start > end ) return {
                result: false,
                hash: Buffer.from (consts.BLOCKCHAIN.BLOCKS_MAX_TARGET),
                nonce:1,
            };

            let answer = await InterfaceBlockchainMining.prototype._mineNonces.call(this, start, Math.min(this.end, start + this.WORKER_NONCES_WORK));

            if (!answer.result && (start + this.WORKER_NONCES_WORK + 1 <= this.end) && this.started && !this.resetForced && !(this.reset && this.useResetConsensus)) { // in case I still have work to do

                let answer2 = await this._mineNonces(start + this.WORKER_NONCES_WORK + 1, Math.min(this.end, start + this.WORKER_NONCES_WORK + this.WORKER_NONCES_WORK));

                if (answer2.hash !== undefined && answer2.hash.compare(answer.hash) < 0)
                    answer = answer2;

            }

            return answer;

        } catch (exception){
            console.error("error _mince _nonces Backbone mining error");
            return {
                result:false,
                hash: Buffer.from (consts.BLOCKCHAIN.BLOCKS_MAX_TARGET),
                nonce:1,
            };
        }

    }

    async _mineNoncesWithWorkers(start, end) {
        let promiseResolve = new Promise((resolve) => {
            this._workerResolve = resolve;

            this._workers.run(start, end);
        });

        return promiseResolve;
    }

    async mine(block, difficulty, start, end,){

        this.block = block;
        this.difficulty = difficulty;
        this.end = Math.min(end, 0xFFFFFFFF);

        this.bestHash = consts.BLOCKCHAIN.BLOCKS_MAX_TARGET_BUFFER;
        this.bestHashNonce = -1;

        // multi threading
        if (this._workers.haveSupport())
            return await this._mineNoncesWithWorkers(start, end);

        // solo
        return await this._mineNonces(start, start + this.WORKER_NONCES_WORK);

    }


}

export default InterfaceBlockchainBackboneMining;