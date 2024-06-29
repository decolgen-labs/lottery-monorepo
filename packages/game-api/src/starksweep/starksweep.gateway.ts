import configuration from '@app/shared/configuration';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { StarkSweepService } from './starksweep.service';

@WebSocketGateway(configuration().game_ports.stark_sweep, {
  cors: {
    origin: '*',
  },
})
export class StarkSweepGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  constructor(private readonly starkSweepService: StarkSweepService) {}

  handleConnection(client: any) {
    console.log(`Client connected to StarkSweep socket: ${client.id}`);
    this.starkSweepService.handleConnection(client);
  }

  handleDisconnect(client: any) {
    console.log(`Client disconnected to StarkSweep socket: ${client.id}`);
    this.starkSweepService.disconnectGame(client);
  }
  afterInit() {
    console.log(`StarkSweep WebSocket Gateway initialized`);
  }

  @SubscribeMessage('update')
  handleUpdate(client: Socket) {
    this.starkSweepService.handleUpdate(client);
  }

  @SubscribeMessage('setBrushPosition')
  handleSetBrushPosition(
    client: Socket,
    x1: string,
    y1: string,
    x2: string,
    y2: string,
  ) {
    this.starkSweepService.handleSetBrushPosition(client, x1, x2, y1, y2);
  }

  @SubscribeMessage('playerTouch')
  handlePlayerTouch(client: Socket) {
    this.starkSweepService.handlePlayerTouch(client);
  }

  @SubscribeMessage('updatePlatformPosition')
  handleUpdatePlatformPosition(
    client: Socket,
    positionX: string,
    positionY: string,
  ) {
    this.starkSweepService.handleUpdatePlatformPosition(
      client,
      positionX,
      positionY,
    );
  }

  @SubscribeMessage('updateLevel')
  handleUpdateLevel(client: Socket, level: number) {
    this.starkSweepService.handleUpdateLevel(client, level);
  }

  @SubscribeMessage('coinCollect')
  handleCoinCollect(client: Socket, positionX: string, positionY: string) {
    this.starkSweepService.handleCoinCollect(client, positionX, positionY);
  }

  @SubscribeMessage('claim')
  handleClaim(client: Socket, address: string) {
    this.starkSweepService.handleClaim(client, address);
  }
}