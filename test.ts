for (let i = 0; i < 2; i++) {
    //dealy of 1 sceond
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("Hello, world!");
}
