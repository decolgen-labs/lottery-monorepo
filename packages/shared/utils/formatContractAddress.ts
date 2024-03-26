export const formattedContractAddress = (contractAddress: string) => {
  if (contractAddress.length == 65) {
    return contractAddress.replace('0x', '0x0');
  }

  return contractAddress.toLowerCase();
};