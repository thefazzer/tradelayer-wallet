import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { ToastrService } from "ngx-toastr";
import ltcUtils from '../../utils/litecore.util'
import { AddressService, IKeyPair, IMultisigPair } from "./address.service";
import { ApiService } from "./api.service";
import { BalanceService } from "./balance.service";
import { DialogService, DialogTypes } from "./dialogs.service";
import { RpcService } from "./rpc.service";
import { TxsService } from "./spot-services/txs.service";

@Injectable({
    providedIn: 'root',
})

export class AuthService {
    public encKey: string = '';
    savedFromUrl: string = '';
    constructor(
        private router: Router,
        private addressService: AddressService,
        private dialogService: DialogService,
        private toastrService: ToastrService,
        private balanceService: BalanceService,
        private apiService: ApiService,
        private txsService: TxsService,
        private rpcService: RpcService,
    ) {}

    get isLoggedIn() {
        return this.addressService.keyPairs.length > 0;
    }

    async register(pass: string) {
        const pair = await this.addressService.generateNewKeyPair() as IKeyPair;
        if (pair.address && pair.privKey, pair.pubKey) {
            this.login(pair);
        };

        this.encKey = ltcUtils.encryptKeyPair(this.addressService.keyPairs, pass);
        this.dialogService.openEncKeyDialog(this.encKey);
        if (this.rpcService.NETWORK === "LTCTEST") this.fundAddress(pair.address);
    }

    private fundAddress(address: string) {
        this.apiService.fundingApi.fundAddress(address)
            .subscribe((res: any) => {
                res.error || !res.data
                    ? this.toastrService.error(res.error || 'Error with funding the address!')
                    : this.toastrService.success(res.data || `Address Funded!`);
            });
    }

    async loginFromPrivKey(privKey: string, pass: string) {
        const res = await this.apiService.socketScriptApi.extractKeyPairFromPrivKey(privKey).toPromise();
    }

    async loginFromKeyFile(key: string, pass: string) {
        const res = ltcUtils.decryptKeyPair(key, pass) as (IKeyPair | IMultisigPair)[];
        if (!res?.length) {
            this.toastrService.error('Wrong Password or keyFile', 'Error');
            return;
        }

        const keyPairs = res.filter((e) => !('redeemScript' in e)) as IKeyPair[];
        if (!keyPairs?.length || !keyPairs[0]?.address || !keyPairs[0]?.pubKey || !keyPairs[0]?.privKey) {
            this.toastrService.error('Wrong keyFile', 'Error');
            return;
        }
        const vaRes = await this.rpcService.rpc('validateaddress', [keyPairs[0].address]);

        if (vaRes.error || !vaRes.data) {
            this.toastrService.error('Error with validating wallet', 'Error');
            return;
        }

        if (!vaRes.data?.isvalid) {
            this.toastrService.error('The Address is not valid', 'Error');
            return;
        }

        if (vaRes.data?.isvalid && !vaRes.data?.ismine) {
            const ipkRes = await this.rpcService.rpc('importprivkey', [keyPairs[0].privKey, "tl-wallet", false]);
        }


        if (!this.rpcService.isOffline) {
            const luRes = await this.rpcService.rpc('listunspent', [0, 999999999, [keyPairs[0]?.address]]);
            const scLuRes: any = await this.apiService.soChainApi.getTxUnspents(keyPairs[0]?.address).toPromise()
            if (luRes.error || !luRes.data || scLuRes.status !== "success" || !scLuRes.data) {
                this.toastrService.error('Unexpecter Error. Please try again!', 'Error');
                return;
            }
    
            if (luRes.data.length < scLuRes.data.txs?.length) {
                this.dialogService.openDialog(DialogTypes.RESCAN, { disableClose: true, data: { key, pass } });
                return;
            }
        } else {
            this.toastrService.info('There may be some incorect balance data', 'Offline wallet');
        }

        this.login(res);
        const allKeyParis = [...this.addressService.keyPairs, ...this.addressService.multisigPairs];
        this.encKey = ltcUtils.encryptKeyPair(allKeyParis, pass);
        return;
    }

    login(pair: IKeyPair | (IKeyPair | IMultisigPair)[]) {
            if (Array.isArray(pair)) {
                pair.forEach((p: any) => {
                    if (p.redeemScript) {
                        this.addressService.addMultisigAddress(p)
                    } else {
                        this.addressService.addDecryptedKeyPair(p);
                        this.balanceService.updateBalances(p.address);
                    }
                });
            } else {
                this.addressService.addDecryptedKeyPair(pair);
                this.balanceService.updateBalances(pair.address);
            }
        this.router.navigateByUrl(this.savedFromUrl);
    }

    logout() {
        this.addressService.removeAllKeyPairs();
        this.balanceService.restartBalance();
        this.txsService.pendingTxs = [];
        this.encKey = '';
        this.router.navigateByUrl('login');
    }
}
