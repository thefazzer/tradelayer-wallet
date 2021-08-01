import { Injectable, OnInit } from "@angular/core";
import { BalanceService } from "./balance.service";
import { SocketService } from "./socket.service";

export interface Position {
    address: string;
    amount: number;
    isBuy: boolean;
    price: number;
    propIdDesired: number;
    propIdForSale: number;
}

@Injectable({
    providedIn: 'root',
})

export class PositionsService {
    private _openedPositions: Position[] = []
    constructor(
        private socketService: SocketService,
        private balancesService: BalanceService,
    ) {
        this._subscribeToSocketEvents()
    }

    get socket() {
        return this.socketService.socket;
    }

    get openedPositions(): Position[] {
        return this._openedPositions;
    }

    set openedPositions(value: Position[]) {
        this._openedPositions = value;
    }

    private _subscribeToSocketEvents() {
        this.socket.on('opened-positions', (openedPositions: Position[]) => {
            this.openedPositions = openedPositions
            this.balancesService.updateLockedBalancesByopenedPositions(openedPositions);
        });
    }

    closeOpenedPosition(position: any) {
        this.socket.emit('close-position', position);
    }
}