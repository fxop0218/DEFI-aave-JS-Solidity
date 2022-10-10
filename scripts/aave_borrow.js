const { getNamedAccounts, network, ethers } = require("hardhat")
const { getWeth, AMOUNT } = require("../scripts/getWeth")
const { networkConfig } = require("../helper-hardhat-config")
const chainId = network.config.chainId

async function main() {
    // All in ERC20
    //await getWeth()
    console.log(chainId)
    const { deployer } = await getNamedAccounts()
    // Interact with the aave protocol
    console.log(deployer.address)
    const lendingPool = await getLendingPool(deployer)
    console.log(chainId)

    console.log(`Lending pool address ${lendingPool.address}`)

    // Deposit
    const wethTokenAddress = networkConfig[chainId]["wethToken"]
    console.log(`Weth token: ${wethTokenAddress}`)
    // Approve
    await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)
    console.log("Depositing the amount...")
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0) //address asset, uint256 amount, address onBehalfOf, uint16 referralCode
    console.log("Successfully deposited")

    // Get available eth to borrow and debt
    let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer)
    // get dai price
    const daiPrice = await getPriceDAI()
    console.log(`Dai/ETH: ${ethers.utils.formatEther(daiPrice)}`)

    // Transform data to dai to can borrow 0.95 = percent of borrowable amount
    const amountDaiToBorrow = availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber())
    console.log(`You can borrow ${amountDaiToBorrow} DAI`)
    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString())

    // Borrow
    await borrowDai(lendingPool, amountDaiToBorrowWei, deployer)

    // If the number changes after last getBorrowUserData is correct
    console.log("\nAfter borrow\n #############################")
    await getBorrowUserData(lendingPool, deployer)

    // Repay the borrowed amount
    await repay(lendingPool, deployer, amountDaiToBorrowWei)

    // If the number changes after last getBorrowUserData is correct
    console.log("\nAfter repay\n############################# ")
    await getBorrowUserData(lendingPool, deployer)
}

// Get lending pool
async function getLendingPool(account) {
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        networkConfig[chainId]["lendingPoolAddressesProvider"],
        account
    )
    const lendingPoolAddress = await lendingPoolAddressesProvider.getLendingPool()
    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account)
    return lendingPool
}
// aprove the erc 20 token
async function approveErc20(erc20contractAddress, spenderAddress, amounToSpend, account) {
    const erc20token = await ethers.getContractAt("IERC20", erc20contractAddress, account)

    const tx = await erc20token.approve(spenderAddress, amounToSpend)
    await tx.wait(1)
    console.log("Approved!!!!!")
}

// get avaible eth to borrow and total debt in eth
async function getBorrowUserData(lendingPool, account) {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account)
    console.log(
        `You have ${ethers.utils.formatEther(
            totalCollateralETH.toString()
        )} ETH worth of ETH to borrow`
    )
    console.log(`You have ${ethers.utils.formatEther(totalDebtETH.toString())} ETH of debt`)
    console.log(`You can borrow ${ethers.utils.formatEther(availableBorrowsETH.toString())} ETH`)
    return { availableBorrowsETH, totalDebtETH }
}

async function getPriceDAI() {
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        networkConfig[chainId]["daiEthPriceFeed"]
    )
    return (await daiEthPriceFeed.latestRoundData())[1]
}

// Borrow the amount
async function borrowDai(lendingPool, amount, account) {
    // address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf
    const borrowTransaction = await lendingPool.borrow(
        networkConfig[chainId]["daiToken"],
        amount,
        1,
        0,
        account
    )
    await borrowTransaction.wait(1)
    console.log(`Borrow completed`)
}

async function repay(lendingPool, account, amount) {
    await approveErc20(networkConfig[chainId]["daiToken"], lendingPool.address, amount, account)
    const repay = await lendingPool.repay(networkConfig[chainId]["daiToken"], amount, 1, account)
    await repay.wait(1)
    console.log("Repay completed")
}

main()
    .then(() => process.exit())
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
