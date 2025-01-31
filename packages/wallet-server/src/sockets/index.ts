import { FastifyInstance } from "fastify"
import { Socket, Server } from "socket.io";
import { io, Socket as SocketClient } from 'socket.io-client';
import { TClient } from "../socket-script/common/types";
import { SocketScript } from '../socket-script/socket-script';
export let walletSocketSevice: WalletSocketSevice;
export let serverSocketService: ServerSocketService;

export const myVersions = {
    nodeVersion: '0.0.2',
    walletVersion: '0.0.2',
};

export const initWalletConnection = (app: FastifyInstance, socketScript: SocketScript) => {
    walletSocketSevice = new WalletSocketSevice(app, socketScript);
    return walletSocketSevice
};

export const initServerConnection = (socketScript: SocketScript, isTestnet: boolean) => {
    serverSocketService = new ServerSocketService(socketScript, isTestnet);
    return serverSocketService;
}

interface IContractInfo {
    contractName: string;
    contractId: number;
}

const getFuturesOrderBookData = async (contract: IContractInfo, asyncClient: TClient) => {
    const { contractName } = contract;
    const buyOrderbooksRes = await asyncClient('tl_getcontract_orderbook', contractName, 1);
    const sellOrderbooksRes = await asyncClient('tl_getcontract_orderbook', contractName, 2);
    const convertData = (d: any) => ({ contractId: d.contractid, price: parseFloat(d.effectiveprice), amount: d.amountforsale })
    const buyOrderbook = (buyOrderbooksRes.error || !buyOrderbooksRes.data) ? [] : buyOrderbooksRes.data.map(convertData)
    const sellOrderbook = (sellOrderbooksRes.error || !sellOrderbooksRes.data) ? [] : sellOrderbooksRes.data.map(convertData);
    const orderbookObject = { buyOrderbook, sellOrderbook };
    return orderbookObject;
}

class WalletSocketSevice {
    public io: Server;
    public currentSocket: Socket;
    private socketScript: SocketScript;
    public lastBlock: number = 0;
    private selectedContractId: IContractInfo = null;
    private blockCountingInterval: any;

    constructor(app: FastifyInstance, socketScript: SocketScript) {
        const socketOptions = { cors: { origin: "*", methods: ["GET", "POST"] } };
        this.io = new Server(app.server, socketOptions);
        this.socketScript = socketScript;
        this.handleEvents()
    }

    private handleEvents() {
        this.io.on('connection', this.onConnection.bind(this));
    }

    private onConnection(socket: Socket) {
        this.currentSocket = socket;
        this.handleFromWalletToServer(socket, 'orderbook-market-filter');
        this.handleFromWalletToServer(socket, 'update-orderbook');
        this.handleFromWalletToServer(socket, 'dealer-data');
        this.handleFromWalletToServer(socket, 'close-position');
        this.handleFromWalletToServer(socket, 'logout');

        socket.on('api-reconnect', (isTestNet: boolean) => initServerConnection(this.socketScript, isTestNet));
        socket.on('update-futures-orderbook', this.sendFuturesOrderbookData.bind(this));
        socket.on('orderbook-contract-filter', (contract: IContractInfo) => {
            this.selectedContractId = contract;
            this.sendFuturesOrderbookData();
        });
    }

    private async sendFuturesOrderbookData() {
        if (!this.selectedContractId) return;
        this.currentSocket.emit('futures-orderbook-data', await getFuturesOrderBookData(this.selectedContractId, this.socketScript.asyncClient));
    }

    private handleFromWalletToServer(socket: Socket, eventName: string) {
        socket.on(eventName, (data: any) => serverSocketService.socket.emit(eventName, data));
    }

    stopBlockCounting() {
        if (this.blockCountingInterval) {
            clearInterval(this.blockCountingInterval);
            this.blockCountingInterval = null;
        }
    }

    startBlockCounting() {
        if (this.blockCountingInterval) return;
             this.blockCountingInterval = setInterval(async () => {
                const { asyncClient } = this.socketScript;
                if (!asyncClient) return;
                const bbhRes = await asyncClient('getbestblockhash');
                if (bbhRes.error || !bbhRes.data) {
                    this.onTimeOutMessage(bbhRes.error);
                    return null;
                }
                const bbRes = await asyncClient('getblock', bbhRes.data);
                if (bbRes.error || !bbRes.data) {
                    this.onTimeOutMessage(bbhRes.error);
                    return null;
                };
                const height = bbRes.data.height;
                if (this.lastBlock < height) {
                    this.lastBlock = height;
                    this.currentSocket.emit('newBlock', height);
                    this.sendFuturesOrderbookData();
                }
            }, 5000);
    }

    async onTimeOutMessage(message: string) {
        if (message && message.includes('ECONNREFUSED')) {
            const { asyncClient } = this.socketScript;
            const check = await asyncClient('tl_getinfo');
            if (check.error || !check.data) {
                this.currentSocket.emit('rpc-connection-error');
                this.socketScript.clearConnection();
            }
        }
    }
}

class ServerSocketService {
    public socket: SocketClient;
    public isTestnet: boolean;
    constructor(private socketScript: SocketScript, isTestnet: boolean) {
        this.isTestnet = isTestnet;
        const url = isTestnet
            ? "http://ec2-13-40-194-140.eu-west-2.compute.amazonaws.com"
            : "http://66.228.57.16";
        const host = `${url}:75`;
        this.socket = io(host, { reconnection: false });
        this.handleEvents();
    }

    terminate() {
        serverSocketService = null;
        this.socket.disconnect();
        this.socket = null;
    }
    private handleEvents() {
        this.socket.on('connect', () => {
            this.socket.emit('check-versions', myVersions);

        });

        this.socket.on('version-guard', (valid: boolean) => {
            valid
                ? walletSocketSevice.io.emit('server_connect')
                : walletSocketSevice.io.emit('need-update');
        });

        this.socket.on('disconnect', () => {
            walletSocketSevice.io.emit('server_disconnect');
        });

        this.socket.on('connect_error', () => {
            walletSocketSevice.io.emit('server_connect_error');
        });

        this.handleFromServerToWallet('trade:error');
        this.handleFromServerToWallet('trade:saved');
        this.handleFromServerToWallet('trade:completed');

        this.handleFromServerToWallet('error_message');
        this.handleFromServerToWallet('opened-positions');
        this.handleFromServerToWallet('orderbook-data');
        this.handleFromServerToWallet('aksfor-orderbook-update');
        this.handleFromServerToWallet('trade-history');

        this.socket.on('new-channel', async (trade: any) => {
            const res = await this.socketScript.channelSwap(this.socket, trade);
            res.error || !res.data
                ? walletSocketSevice.io.emit('trade:error', res.error)
                : walletSocketSevice.io.emit('trade:success', { data: res.data, trade });

            if (trade.filled && (trade?.secondSocketId === this.socket.id)) walletSocketSevice.io.emit('trade:completed', true);
        });
    }
    
    private handleFromServerToWallet(eventName: string) {
        this.socket.on(eventName, (data: any) => walletSocketSevice.currentSocket.emit(eventName, data));
    }
}