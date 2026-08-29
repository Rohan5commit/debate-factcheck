class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      if (channelData) {
        this.port.postMessage(channelData.slice(0));
      }
    }
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
