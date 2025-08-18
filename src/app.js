const express = require("express")
const app = express();


app.get("/health", (req, res)=> {
    res.status(200).send("healthy");
})

app.listen(3000, ()=> {
    console.log("We live")
})