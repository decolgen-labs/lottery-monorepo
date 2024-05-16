import {
  BOARD,
  BOARDCELL,
  DEFAULT_DROP_TIME,
  Direction,
  GameEvents,
  PLAYER,
  TetrisGameStatus,
} from '@app/shared/types';
import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { createBoard, isColliding } from './game/helper';
import { playerRotate, resetPlayer, updatePlayerPos } from './game/player';
import { WsException } from '@nestjs/websockets';
import { isValidDirection } from '../2048/board/direction';

export type TetrisGameParam = {
  socket: Socket;
  board: BOARD;
  status: TetrisGameStatus;
  player: PLAYER;
  point: number;
  isClaimable: boolean;
  level: number;
  rows: number;
  interval: any;
};

@Injectable()
export class TetrisService {
  private sockets: TetrisGameParam[] = [];

  private sendBoard(client: TetrisGameParam) {
    client.socket.emit(GameEvents.BOARD_UPDATED_EVENT, client.board);
  }

  private sendGameStatus(client: TetrisGameParam) {
    client.socket.emit(GameEvents.GAME_STATUS_EVENT, client.status);
  }

  private sendGamePoint(client: TetrisGameParam) {
    client.socket.emit(GameEvents.GAME_POINT_EVENT, {
      point: client.point,
      claimable: client.isClaimable,
    });
  }

  private sweepRows = (client: TetrisGameParam, newBoard: BOARD): BOARD => {
    return newBoard.reduce((ack, row) => {
      // If we don't find a 0 it means that the row is full and should be cleared
      if (row.findIndex((cell) => cell[0] === 0) === -1) {
        client.rows += 1;
        // Create an empty row at the beginning of the array to push the Tetrominos down
        // instead of returning the cleared row
        ack.unshift(
          new Array(newBoard[0].length).fill([0, 'clear']) as BOARDCELL[],
        );
        return ack;
      }

      ack.push(row);
      return ack;
    }, [] as BOARD);
  };

  private updateBoard = (client: TetrisGameParam) => {
    if (!client.player.pos) return;
    // First flush the stage
    // If it says "clear" but don't have a 0 it means that it's the players move and should be cleared
    const newBoard = client.board.map(
      (row) =>
        row.map((cell) =>
          cell[1] === 'clear' ? [0, 'clear'] : cell,
        ) as BOARDCELL[],
    );

    // Then draw the tetromino
    client.player.tetromino.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          newBoard[y + client.player.pos.y][x + client.player.pos.x] = [
            value,
            `${client.player.collided ? 'merged' : 'clear'}`,
          ];
        }
      });
    });

    if (client.player.collided) {
      client.player = resetPlayer();
      client.board = this.sweepRows(client, newBoard);
    } else {
      client.board = newBoard;
    }

    this.sendBoard(client);
  };

  private movePlayer = (client: TetrisGameParam, dir: number) => {
    if (!isColliding(client.player, client.board, { x: dir, y: 0 })) {
      client.player = updatePlayerPos(client.player, {
        x: dir,
        y: 0,
        collided: false,
      });

      this.updateBoard(client);
    }
  };

  private getCurrentDropTime = (client: TetrisGameParam): number => {
    if (client.level === 1) {
      return DEFAULT_DROP_TIME;
    }
    return DEFAULT_DROP_TIME / client.level + 200;
  };

  private setDropTime = (client: TetrisGameParam) => {
    if (client.interval) {
      clearInterval(client.interval);
    }

    client.interval = setInterval(
      this.drop,
      this.getCurrentDropTime(client),
      client,
    );
  };

  private drop = (client: TetrisGameParam): void => {
    if (client.status !== 'started') throw new WsException('Game not started');
    // Increase level when player has cleared 10 rows
    if (client.rows > client.level * 10) {
      client.level += 1;
      // Also increase speed
      this.setDropTime(client);
    }

    if (!isColliding(client.player, client.board, { x: 0, y: 1 })) {
      client.player = updatePlayerPos(client.player, {
        x: 0,
        y: 1,
        collided: false,
      });
    } else {
      // Game over!
      if (client.player.pos.y < 1) {
        client.status = 'lost';
        clearInterval(client.interval);
        this.sendGameStatus(client);
      }

      client.player = updatePlayerPos(client.player, {
        x: 0,
        y: 0,
        collided: true,
      });
    }

    this.updateBoard(client);
  };

  command(socket: Socket, direction: Direction) {
    const client = this.sockets.find((client) => client.socket === socket);
    if (client.status !== 'started') {
      throw new WsException('Game not started');
    }

    if (!isValidDirection(direction)) {
      throw new WsException('Wrong move');
    }

    switch (direction) {
      case 'up':
        client.player = playerRotate(client);
        this.updateBoard(client);
        break;
      case 'right':
        this.movePlayer(client, 1);
        break;
      case 'down':
        this.drop(client);
        break;
      case 'left':
        this.movePlayer(client, -1);
        break;
    }
  }

  startNewGame(socket: Socket) {
    let client = this.sockets.find((client) => client.socket === socket);
    if (client) {
      client.board = createBoard();
      client.status = 'started';
      client.player = resetPlayer();
      client.rows = 0;
      client.level = 1;
    } else {
      client = {
        socket,
        board: createBoard(),
        status: 'started',
        player: resetPlayer(),
        point: 0,
        isClaimable: false,
        level: 1,
        rows: 0,
        interval: null,
      };

      this.sockets.push(client);
    }

    this.sendBoard(client);
    this.sendGameStatus(client);
    this.sendGamePoint(client);
    this.setDropTime(client);
  }

  pause(socket: Socket) {
    const client = this.sockets.find((client) => client.socket === socket);
    if (client.status !== 'started') {
      throw new WsException('Game not started or paused');
    }

    client.status = 'paused';
    clearInterval(client.interval);
    this.sendGameStatus(client);
  }

  resume(socket: Socket) {
    const client = this.sockets.find((client) => client.socket === socket);
    if (client.status !== 'paused') {
      throw new WsException('Game not paused');
    }

    client.status = 'started';
    this.setDropTime(client);
    this.sendGameStatus(client);
  }
}
