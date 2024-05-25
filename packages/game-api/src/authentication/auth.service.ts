import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { Web3Service } from '@app/web3/web3.service';
import {
  convertDataIntoString,
  formattedContractAddress,
} from '@app/shared/utils';
import { TypedData, shortString, typedData } from 'starknet';
import { ABIS } from '@app/web3/types';
import { GetTokenReqDto, JwtPayload } from './dto/auth.dto';
import configuration from '@app/shared/configuration';

@Injectable()
export class AuthenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly web3Service: Web3Service,
  ) {}

  async getSignMessage(address: string, nonce: string) {
    const formatAddress = formattedContractAddress(address);
    const typedDataValidate: TypedData = {
      types: {
        StarkNetDomain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'felt' },
          { name: 'chainId', type: 'felt' },
        ],
        Validate: [
          { name: 'address', type: 'felt' },
          { name: 'nonce', type: 'selector' },
        ],
      },
      primaryType: 'Validate',
      domain: {
        name: 'stark-arcade',
        version: '1',
        chainId: shortString.encodeShortString('SN_SEPOLIA'),
      },
      message: {
        address: formatAddress,
        nonce: nonce,
      },
    };
    return typedDataValidate;
  }

  async verifySignature(address: string, signature: string[], rpc: string) {
    const user = await this.userService.getUser(address);

    const message = await this.getSignMessage(address, user.nonce);
    try {
      const msgHash = typedData.getMessageHash(message, address);

      const accountContract = await this.web3Service.getContractInstance(
        ABIS.AccountABI,
        address,
        rpc,
      );

      const result = await accountContract.is_valid_signature(
        msgHash,
        signature,
      );

      return convertDataIntoString(result);
    } catch (error) {
      throw new Error(error);
    }
  }

  async login({ address, signature, rpc }: GetTokenReqDto) {
    const accessPayload = {
      sub: formattedContractAddress(address),
      role: [],
    };
    const data = await this.verifySignature(address, signature, rpc);
    if (!data) {
      throw new Error('Signature is not valid');
    }

    const token = await this.generateToken(accessPayload);
    await this.userService.updateRandomNonce(address);
    return {
      token: token,
    };
  }

  async generateToken(accessPayload: JwtPayload) {
    const token = await this.jwtService.signAsync(accessPayload, {
      secret: configuration().jwt.secret,
    });
    return token;
  }
}
