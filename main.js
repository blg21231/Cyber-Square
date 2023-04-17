// Ethereum imports
import { ethers } from 'ethers';
import { NFT_ABI } from './nft_abi.js';

// wagmi imports
import { createClient, configureChains, mainnet} from '@wagmi/core'
import { getAccount, prepareWriteContract, writeContract, readContract, watchContractEvent } from '@wagmi/core'

// WalletConnect imports
import { EthereumClient, w3mConnectors, w3mProvider } from '@web3modal/ethereum'
import { Web3Modal } from '@web3modal/html';

// Apollo imports
import { ApolloClient, InMemoryCache, gql } from '@apollo/client'

// Configuration
const projectId = 'd0d3942c847d17e11c0a2ff55b311de8'; 
const chains = [mainnet]
const NFT_CONTRACT_ADDRESS = '0xfB7fC51E7051930461A62b9969b644E5554B1039';
const APIURL = 'https://api.studio.thegraph.com/query/45217/digital-good/v0.0.1'

const { provider } = configureChains(chains, [w3mProvider({ projectId })])
const wagmiClient = createClient({
  autoConnect: true,
  connectors: w3mConnectors({ projectId, version: 1, chains }),
  provider
})
const ethereumClient = new EthereumClient(wagmiClient, chains)
const web3modal = new Web3Modal({ projectId }, ethereumClient)

const fetchAllDigitalGoodsQuery = `
  query {
    digitalGoods(first: 20, orderBy: tokenId, orderDirection: desc, where: {remainingSupply_gt: "0"}) {
      tokenId
      name
      description
      category
      lister
      listerPrice
      remainingSupply
      previewLink
    }
  }
`;

const fetchFilteredDigitalGoodsQuery = `
  query FetchDigitalGoods($searchTerm: String!) {
    digitalGoods(
      first: 20
      orderBy: tokenId
      orderDirection: desc
      where: {name_contains_nocase: $searchTerm, remainingSupply_gt: "0"}) {
      tokenId
      name
      description
      category
      lister
      listerPrice
      remainingSupply
      previewLink
    }
  }
`;

const client = new ApolloClient({
  uri: APIURL,
  cache: new InMemoryCache(),
})

client
  .query({
    query: gql(fetchAllDigitalGoodsQuery),
  })
  .then((data) => console.log('Subgraph data: ', data))
  .catch((err) => {
    console.log('Error fetching data: ', err)
  })

// Fetch all digital goods data
async function fetchData() {
  try {
    const result = await client.query({
      query: gql(fetchAllDigitalGoodsQuery),
    });
    return result?.data?.digitalGoods;
  } catch (err) {
    console.log('Error fetching data: ', err);
  }
}

// Fetch digital goods data based on a search term
async function fetchSearchedData(searchTerm) {
  try {
    const result = await client.query({
      query: gql(fetchFilteredDigitalGoodsQuery),
      variables: { searchTerm },
    });
    return result?.data?.digitalGoods;
  } catch (err) {
    console.log('Error fetching data: ', err);
  }
}

async function performSearch() {
  const searchTermInput = document.getElementById("search-input");
  const searchTerm = String(searchTermInput.value); 
  const digitalGoods = await fetchSearchedData(searchTerm);
  displayData(digitalGoods);
}
  

// Display the digital goods data
function displayData(digitalGoods) {
  if (digitalGoods) {
    // Get table body
    const tableBody = document.getElementById('goods');

    // Clear previous content
    tableBody.innerHTML = '';

    // Loop through the data and create table rows
    digitalGoods.forEach((good) => {
      const row = document.createElement('tr');

      // Create and append table cells
      ['tokenId', 'name', 'description', 'category', 'lister', 'listerPrice', 'remainingSupply', 'previewLink'].forEach((key) => {
        const cell = document.createElement('td');
        if (key === 'listerPrice') {
          // Convert Wei to Ether before displaying the price
          const etherValue = ethers.BigNumber.from(good[key]);
          const newValue = etherValue.mul(5).div(4);
          cell.textContent = ethers.utils.formatEther(newValue);          
        } else {
          cell.textContent = good[key];
        }
        row.appendChild(cell);
      });

      // Create and append Access Link button
      const accessLinkCell = document.createElement('td');
      const accessLinkButton = document.createElement('button');
      accessLinkButton.textContent = 'Access Link';
      accessLinkButton.classList.add('btn', 'btn-primary');
      accessLinkButton.addEventListener('click', (event) => handleAccessLinkButtonClick(event, good));
      accessLinkCell.appendChild(accessLinkButton);
      row.appendChild(accessLinkCell);

      // Create and append Buy button
      const buyCell = document.createElement('td');
      const buyButton = document.createElement('button');
      buyButton.textContent = 'Buy';
      buyButton.classList.add('btn', 'btn-primary');
      buyButton.addEventListener('click', (event) => handleBuyButtonClick(event, good));
      buyCell.appendChild(buyButton);
      row.appendChild(buyCell);

      // Append the row to the table body
      tableBody.appendChild(row);
    });
    }
}

async function ensureWalletConnected() {
  const account = getAccount().address;
  if (!account) {
    alert('Please connect your wallet using the WalletConnect button above.');
  }
}

// New function to handle the Buy button click
async function handleBuyButtonClick(event, good) {
  const userInput = prompt('Enter the quantity you would like to purchase:');
  const quantity = parseFloat(userInput); // Parse the user input as a floating-point number
  
  if (userInput !== String(quantity) || quantity < 1 || !Number.isInteger(quantity)) {
    alert("Error: Quantity must be a positive integer.");
    return;
  }
  
  if (quantity > good.remainingSupply) {
    alert('Not enough supply available. Please enter a lower quantity.');
    return;
  }

  await ensureWalletConnected();

  const tokenId = good.tokenId;
  const listerPrice = good.listerPrice;

  const nftData = [ tokenId, listerPrice, quantity ];

  const buyerAddress = getAccount().address; // Get the connected wallet address
  const valueInWei = ethers.BigNumber.from(listerPrice).mul(quantity);

  const config = await prepareWriteContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_ABI,
    functionName: 'buyNFT',
    args: nftData,
    overrides: {
      from: buyerAddress, // Pass the buyer's wallet address
      value: valueInWei.mul(5).div(4),
    },
  });

  console.log('Transaction config prepared:', config);
  alert("Buying Digital Good...Please check back after the transaction has been confirmed on the blockchain to access your Digital Good");

  try {
    const data = await writeContract(config);
    console.log('buyNFT transaction sent. Result:', data);

  } catch (error) {
    console.error("Error buying Digital Good:", error);

    // Extract the reason from the error message
    const reasonMatch = error.message.match(/reason="(.+?)"/);
    const reason = reasonMatch ? reasonMatch[1] : "Unknown error";

    alert(`Error: ${reason}`);
  }

  const digitalGoods = await fetchData();
  displayData(digitalGoods);
}

async function handleAccessLinkButtonClick(event, good) {
  event.preventDefault();

  await ensureWalletConnected();

  const tokenId = good.tokenId;
  const buyerAddress = getAccount().address; // Get the connected wallet address

  try {
    const accessLink = await readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'getAccessLink',
      args: [tokenId],
      overrides: { from: buyerAddress }, // Pass the buyer's wallet address
    });

    if (accessLink) {
      // Display the access link to the user
      alert(`Access link: ${accessLink}`);
    } else {
      alert('No access link found for this NFT.');
    }
  } catch (error) {
    console.error('Error getting access link:', error);

    // Extract the reason from the error message
    const reasonMatch = error.message.match(/reason="(.+?)"/);
    const reason = reasonMatch ? reasonMatch[1] : "Unknown error";

    alert(`Error: ${reason}`);
  }
}

// Listen for the form submit event
document.getElementById("list-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  console.log("Form submitted.");

  // Get the form data
  const name = document.getElementById("name").value;
  const description = document.getElementById("description").value;
  const category = document.getElementById("category").value;
  const listerPriceInput = document.getElementById("listerPrice").value;
  const totalSupplyInput = document.getElementById("totalSupply").value;
  const previewLink = document.getElementById("preview-link").value;
  const accessLink = document.getElementById("access-link").value;

  // Verify that totalSupply is a positive integer value
  if (isNaN(totalSupplyInput) || !Number.isInteger(+totalSupplyInput) || +totalSupplyInput <= 0) {
    alert("Error: Total supply must be a positive integer.");
    return;
  }

  // Verify that listerPrice is a positive value
  if (isNaN(listerPriceInput) || +listerPriceInput <= 0) {
    alert("Error: Lister price must be a positive value.");
    return;
  }

  // Convert the listerPrice to Wei
  const listerPrice = ethers.utils.parseEther(listerPriceInput);
  const totalSupply = totalSupplyInput;

  const nftData = [ name, description, category, listerPrice, totalSupply, previewLink, accessLink ];

  // Ensure the wallet is connected
  console.log("Checking wallet connection...");
  await ensureWalletConnected();

  // Call the smart contract method to list a new NFT
  console.log("Sending listNFT transaction..."); 

  const config = await prepareWriteContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_ABI,
    functionName: 'listNFT',
    args: nftData
  })
  console.log("Transaction config prepared:", config);
  alert(`Listing Digital Good...Please check back after the transaction has been confirmed on the blockchain to view your Digital Good`);

  try {
    const data = await writeContract(config);
    console.log("listNFT transaction sent. Result:", data);

  } catch (error) {
    console.error("Error listing new Digital Good:", error);

    // Extract the reason from the error message
    const reasonMatch = error.message.match(/reason="(.+?)"/);
    const reason = reasonMatch ? reasonMatch[1] : "Unknown error";

    alert(`Error: ${reason}`);
  }

  const digitalGoods = await fetchData();
  displayData(digitalGoods);
});

document.getElementById("search-btn").addEventListener("click", performSearch);

document.addEventListener('DOMContentLoaded', async () => {
  const digitalGoods = await fetchData();
  displayData(digitalGoods);
});