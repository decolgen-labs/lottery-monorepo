import {
  Direction,
  GameEvents,
  ServerGameStatusParam,
  WINNING_VALUE,
} from '@app/shared/types';
import { Injectable } from '@nestjs/common';
import { BoardService } from './board/board.service';
import { Socket } from 'socket.io';
import { isValidDirection } from './board/direction';
import { WsException } from '@nestjs/websockets';
import { Web3Service } from '@app/web3/web3.service';
import { Account, stark } from 'starknet';
import { InjectModel } from '@nestjs/mongoose';
import { ChainDocument, Chains } from '@app/shared/models/schemas';
import { Model } from 'mongoose';
import configuration from '@app/shared/configuration';
import { getClaimPointMessage } from '@app/shared/utils';

export type GameParam = {
  socket: Socket;
  board: BoardService;
  status: ServerGameStatusParam;
  point: number;
  winningPointCount: number;
  isClaimable: boolean;
};

export type PointParam = {
  userAddress: string;
  point: number;
  timestamp: number;
  proof: string[];
};

@Injectable()
export class Game2048Service {
  private sockets: GameParam[] = [];
  constructor(
    @InjectModel(Chains.name)
    private readonly chain: Model<ChainDocument>,
    private readonly web3Service: Web3Service,
  ) {}

  private sendBoard(game: GameParam, board: string) {
    game.socket.emit(GameEvents.BOARD_UPDATED_EVENT, board);
  }

  private sendGameStatus(game: GameParam) {
    game.socket.emit(GameEvents.GAME_STATUS_EVENT, game.status);
  }

  private sendGamePoint(game: GameParam) {
    game.socket.emit(GameEvents.GAME_POINT_EVENT, {
      point: game.point,
      claimable: game.isClaimable,
    });
  }

  private sendUpdate(game: GameParam) {
    const serialized = game.board.serialize();
    this.sendBoard(game, serialized);
  }

  private sendClaimPoint(game: GameParam, param: PointParam) {
    game.socket.emit(GameEvents.CLAIM_POINT_EVENT, param);
  }

  onCommand = (socket: Socket, direction: Direction) => {
    const game = this.sockets.find((s) => s.socket === socket);
    if (game.status !== 'started') {
      throw new WsException('Game not started');
    }
    if (!isValidDirection(direction)) {
      throw new WsException('Wrong move');
    }

    switch (game.board.move(direction, game.board.getSize())) {
      case 'win':
        game.isClaimable = true;
        if (game.winningPointCount === 0) {
          game.point += 8;
        } else {
          game.point += 4;
        }
        this.sendGamePoint(game);
        this.sendGameStatus(game);
        break;
      case 'lose':
        game.status = 'lost';
        this.sendGameStatus(game);
        break;
      default:
        game.isClaimable = true;
        game.point += 1;
        this.sendGamePoint(game);
        break;
    }
    this.sendUpdate(game);
  };

  startNewGame(socket: Socket, size: number) {
    let client = this.sockets.find((game) => game.socket === socket);
    if (client) {
      client.board = new BoardService(size, WINNING_VALUE);
      client.winningPointCount = 0;
      client.status = 'started';
    } else {
      client = {
        socket,
        board: new BoardService(size, WINNING_VALUE),
        status: 'started',
        point: 0,
        winningPointCount: 0,
        isClaimable: false,
      };

      this.sockets.push(client);
    }

    this.sendBoard(client, client.board.serialize());
    this.sendGamePoint(client);
    this.sendGameStatus(client);
  }

  async claimPoint(socket: Socket, userAddress: string) {
    const client = this.sockets.find((game) => game.socket === socket);

    if (!client.isClaimable) {
      throw new WsException('Do not have any permission to claim point');
    }

    const ChainDocument = await this.chain.findOne();
    const provider = this.web3Service.getProvider(ChainDocument.rpc);
    const signerAccount = new Account(
      provider,
      configuration().signer_wallet.address,
      configuration().signer_wallet.private_key,
    );

    const timestamp = new Date().getTime();
    const claimPointMessage = getClaimPointMessage(
      userAddress,
      client.point,
      timestamp,
    );

    client.isClaimable = false;
    client.point = 0;

    const proof = await signerAccount.signMessage(claimPointMessage);
    const formattedProof = stark.formatSignature(proof);
    const pointData: PointParam = {
      userAddress,
      point: client.point,
      timestamp,
      proof: formattedProof,
    };
    this.sendClaimPoint(client, pointData);
    this.sendGamePoint(client);
  }

  closeGame(socket: Socket) {
    const client = this.sockets.find((game) => game.socket === socket);
    if (client) {
      client.status = 'canceled';
      this.sendGamePoint(client);
      this.sendGameStatus(client);
    }
  }

  disconnectGame(socket: Socket) {
    this.sockets = this.sockets.filter((sk) => sk.socket !== socket);
  }
}
