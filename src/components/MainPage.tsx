import { StakeToken } from "./Youtube_ERC20/StakeToken";
import { client } from "../app/client";
import { chain } from "../app/chain";
import { ConnectEmbed } from "../app/thirdweb";

export default function MainPage() {
  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      width: "100%",
      padding: "20px 0",
    }}>
      <div style={{ textAlign: "center" }}>
        <ConnectEmbed
          client={client}
          chain={chain}
        />
        <StakeToken />
      </div>
    </div>
  );
}
