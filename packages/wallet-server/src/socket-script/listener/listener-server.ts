import { Server, Socket } from "socket.io";
import { TClient } from "../common/types";
import { Listener } from "./listener";

export class ListenerServer {
    private io: Server;
    private port: number;
    private address: string;
    private pubkey: string;
    private client: TClient;
    private logs: boolean;

    constructor(address: string, port: number, client: TClient, logs: boolean) {
        this.port = port
        this.address = address;
        this.client = client;
        this.logs = logs;
        this.validateAddress();
    }

  close(): void {
    this.io.close();
  }

  private async validateAddress() {
    const vaRes = await this.client("validateaddress", this.address);
    const { error, data } = vaRes;
    if (!error && data?.isvalid) {
        if (!data.ismine) {
        } else {
            this.pubkey = data.pubkey;
            this.init();
        }
    } else {
    }
  }

  private init(): void {
    const socketOptions = { cors: { origin: "*", methods: ["GET", "POST"] } };
    this.io = require('socket.io')(this.port, { socketOptions });
    this.io.on("connection", this.onConnection.bind(this));
  }

  private onConnection(socket: Socket): void {
    new Listener(socket, this.address, this.pubkey, this.client, this.logs);
  }
}