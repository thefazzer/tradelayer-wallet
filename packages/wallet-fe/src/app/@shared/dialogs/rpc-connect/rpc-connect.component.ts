import { Component, Input } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { DialogService, DialogTypes } from 'src/app/@core/services/dialogs.service';
import { LoadingService } from 'src/app/@core/services/loading.service';
import { RPCCredentials, RpcService } from 'src/app/@core/services/rpc.service';
const defaultPath = ' ';
@Component({
  selector: 'rpc-connect-dialog',
  templateUrl: './rpc-connect.component.html',
  styleUrls: ['./rpc-connect.component.scss']
})
export class RPCConnectDialog {
  public loading: boolean = false;
  public message: string = ' ';
  public message2: string = ' ';

  public host: string = 'localhost';
  public port: number = 9332;
  public username: string = '';
  public password: string = '';
  public defaultDirectoryCheckbox: boolean = true;
  public directory: string = defaultPath;

  constructor(
    private rpcService: RpcService,
    public dialogRef: MatDialogRef<RPCConnectDialog>,
    private loadingService: LoadingService,
    private dialogService: DialogService,
    private router: Router,
  ) {}

  async connect() {
    this.message = ' ';
    this.loadingService.isLoading = true;

    const { host, port, username, password } = this;
    const credentials: RPCCredentials = { host, port, username, password };
    const isConnected = await this.rpcService.connect(credentials);
    this.loadingService.isLoading = false;
    if (!isConnected) {
      this.message = 'Please try again! ';
    } else {
      this.dialogRef.close();
      this.dialogService.openDialog(DialogTypes.SYNC_NODE);
      this.loadingService.isLoading = false;
    }
  }

  async startWalletNode() {
    this.message2 = ' ';
    this.loadingService.isLoading = true;
    const path = this.defaultDirectoryCheckbox ? defaultPath : this.directory;
    const res = await this.rpcService.startWalletNode(path) 
    if (res.error || !res.data) {
      this.message2 = res.error || 'Please Try Again!';
      this.loadingService.isLoading = false;
      return;
    }
    this.dialogRef.close();
    this.dialogService.openDialog(DialogTypes.SYNC_NODE);
    this.loadingService.isLoading = false;
  }

  async newNodeConfiguration() {
    this.message2 = ' ';
    const dialogOptions = { disableClose: false, hasBackdrop: true };
    this.dialogService.openDialog(DialogTypes.NEW_NODE, dialogOptions);
  }
}
