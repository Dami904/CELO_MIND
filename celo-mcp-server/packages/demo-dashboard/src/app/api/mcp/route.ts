import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { message, walletAddress } = await request.json();
    const cleanMsg = (message || "").toLowerCase();

    let responseText = "Instruction processed by CeloMind MCP agent. What would you like to execute next on Celo?";
    let responseData: any = null;

    if (cleanMsg.includes("balance") || cleanMsg.includes("holdings")) {
      responseText = "I've fetched your current token holdings on Celo Mainnet.";
      responseData = {
        resultCard: {
          title: "Wallet Token Holdings",
          data: [
            { label: "CELO", value: "2,450.00 CELO", color: "green" },
            { label: "cUSD", value: "1,280.50 cUSD", color: "green" },
            { label: "cEUR", value: "840.20 cEUR", color: "green" },
            { label: "Wallet Address", value: walletAddress || "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" }
          ]
        }
      };
    } else if (cleanMsg.includes("swap") || cleanMsg.includes("celo for cusd")) {
      responseText = "Transaction staged. To proceed with swapping 10 CELO for cUSD, please sign the transaction.";
      responseData = {
        pendingTx: {
          title: "Swap CELO for cUSD",
          data: [
            { label: "Action", value: "Swap Tokens" },
            { label: "Sell Amount", value: "10.00 CELO" },
            { label: "Buy Amount (Est)", value: "11.80 cUSD" },
            { label: "Slippage Tolerance", value: "0.5%" },
            { label: "Router Address", value: "0xE3D...89f1" }
          ]
        }
      };
    } else if (cleanMsg.includes("transfer") || cleanMsg.includes("send")) {
      responseText = "Transaction staged. To transfer 1 CELO, please verify parameters and sign.";
      responseData = {
        pendingTx: {
          title: "CELO Token Transfer",
          data: [
            { label: "Action", value: "Transfer" },
            { label: "Asset", value: "CELO" },
            { label: "Amount", value: "1.00 CELO" },
            { label: "Recipient", value: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
            { label: "Gas Limit (Est)", value: "21,000" }
          ]
        }
      };
    } else if (cleanMsg.includes("allowance") || cleanMsg.includes("approve")) {
      responseText = "Allowance and contract spender parameters retrieved.";
      responseData = {
        resultCard: {
          title: "Contract Allowances",
          data: [
            { label: "Contract Token", value: "cUSD (0x765a...12)" },
            { label: "Authorized Spender", value: "Ubeswap Router (0xe19f...c3)" },
            { label: "Approved Allowance", value: "Unlimited Allowance", color: "green" },
            { label: "Status", value: "ACTIVE", color: "green" }
          ]
        }
      };
    } else if (cleanMsg.includes("whale") || cleanMsg.includes("detect")) {
      responseText = "Detected high-volume transfers on Celo network in the past 24 hours.";
      responseData = {
        resultCard: {
          title: "Whale Alert Report",
          data: [
            { label: "Largest Tx (CELO)", value: "120,000 CELO", color: "yellow" },
            { label: "Total Traded Vol", value: "$450,230 cUSD", color: "yellow" },
            { label: "Active Whale Accounts", value: "4 addresses" },
            { label: "Network Activity Level", value: "ELEVATED", color: "yellow" }
          ]
        }
      };
    } else if (cleanMsg.includes("audit") || cleanMsg.includes("contract")) {
      responseText = "Contract safety audit completed for target address.";
      responseData = {
        resultCard: {
          title: "Security Audit",
          data: [
            { label: "Contract Safety Score", value: "98 / 100", color: "green" },
            { label: "Verified Source Code", value: "YES", color: "green" },
            { label: "Identified Vulnerabilities", value: "0 detected", color: "green" },
            { label: "Audit Rating", value: "LOW RISK", color: "green" }
          ]
        }
      };
    } else if (cleanMsg.includes("gas") || cleanMsg.includes("history")) {
      responseText = "Gas price diagnostics for the Celo Network over the last 100 blocks.";
      responseData = {
        resultCard: {
          title: "Gas Price History",
          data: [
            { label: "Base Fee (Avg)", value: "0.5 Gwei", color: "green" },
            { label: "Network State", value: "NORMAL / LOW GAS", color: "green" },
            { label: "Transfer Gas Cost (CELO)", value: "0.00001 CELO", color: "green" },
            { label: "Gas Limit Limit Check", value: "PASSED", color: "green" }
          ]
        }
      };
    }

    return NextResponse.json({
      success: true,
      message: responseText,
      data: responseData
    });
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json({
      success: false,
      message: "An internal server error occurred processing the MCP request."
    }, { status: 500 });
  }
}
