/**
 * MQTT Controller
 *
 * @file   MQTTController.js
 * @author airthusiast
 * @since  1.0.0
 */

const mqtt = require("mqtt");
const SchellenbergAPIConnector = require("../services/SchellenbergAPIConnector");
const LogService = require("schellenbergapi/Service/LogService");

var deviceMap;

class MQTTController {
  /**
   * The MQTT controller, handles MQTT messages between external clients and Schellenberg API.
   *
   * @param {int} inConfig the config
   */
  constructor(config) {
    // LogService
    this.logService = new LogService(config.debugConfig);

    // Schellenberg API
    this.apiConnector = new SchellenbergAPIConnector(config).getInstance();

    // Create up/stop/down mapping
    this.valueMapping = new Map([['open', config.payload.open], ['close', config.payload.close], ['stop', config.payload.stop]]);

    // Create MQTT client
    this.connect(config.mqtt.url, config.mqtt.username, config.mqtt.password);

    // Setup listeners
    this.setupListeners();
  }

  /**
   * Connect to the MQTT Broker
   *
   * @param {string} url URL of the MQTT broker
   * @param {string} username username for MQTT authentication
   * @param {string} password password for MQTT authentication
   */
  connect(url, username, password) {
    this.client = mqtt.connect(url, {
      username: username,
      password: password,
    });
  }

  /**
   * Setup listeners to:
   *  - the MQTT broker events
   *  - Schellenberg API events
   *
   */
  setupListeners() {
    // Subscribe to all schellenberg topics
    this.client.on("connect", () => {
      this.client.subscribe("schellenberg/device/value/#");
    });

    // IN: MQTT Broker ==> Controller ==> SmartFriends
    // Topic example: schellenberg/device/value/update/xxxxx
    this.client.on("message", (topic, message) => {
      this.logService.debug("New message on topic " + topic  + ": " + message, "MQTTController");
      var topic_levels = topic.split("/");
      if (
        topic.startsWith("schellenberg/device/value/update/") &&
        !isNaN(topic_levels[4])
      ) {
        this.logService.debug("Handler found for topic " + topic, "MQTTController");
        return this.processDeviceUpdate(topic_levels[4], message);
      } else {
        this.logService.debug("No handler found for topic " + topic, "MQTTController");
      }
    });

    // OUT: SmartFriends ==> Controller ==> MQTT Broker
    // Topic example: schellenberg/device/value/xxxxx
    this.apiConnector.api.on("newDV", (data) =>
      this.publishDeviceStatus(data)
    );

    this.apiConnector.api.on("newDI", (data) => {
      this.logService.debug("Device found:");
      this.logService.debug(" > deviceID:          " + data.deviceID);
      this.logService.debug(" > masterDeviceID  :  " + data.masterDeviceID);
      this.logService.debug(" > masterDeviceName:  " + data.masterDeviceName);
      this.logService.debug(" > deviceName:        " + data.deviceName);
      this.logService.debug(" > deviceDesignation: " + data.deviceDesignation);
      // Update deviceMap
      deviceMap = this.apiConnector.getDeviceMap();
    });
  }

  /**
   * Updates the Smart Friends Device based on the given information
   *
   * @param {number} deviceID the device's ID to operate
   * @param {string} value the new device value to set
   */
  processDeviceUpdate(deviceID, newValue) {
    try {
      newValue = JSON.parse(newValue.toString());
    } catch (e) {
      newValue = newValue.toString();
    }
    return this.apiConnector.setDeviceValue(deviceID, newValue);
  }

  /**
   * Publishes latest Smart Friends Device status to MQTT
   *
   * @param {number} deviceID the device's ID to operate
   * @param {string} value the new device value to publish
   */
  publishDeviceStatus(data) {
    if (data.deviceID !== "" && data.value !== "") {
      let topic = "schellenberg/device/value/" + data.deviceID;
      var message;
      try{
        message = JSON.stringify(data.value);
      } catch (e) {
        message = data.value.toString();
      }

      this.logService.debug(topic + " => " + message, "MQTTController");
      var options = { retain: true, qos: 0 };
      this.client.publish(topic, message, options);

      // Set target position when 'up' or 'down' command
      if (deviceMap.get(data.deviceID)['deviceName'] == 'Schalter' && (message === this.valueMapping.get('open') || message === this.valueMapping.get('close'))) {
        for (const [key, value] of deviceMap) {
          if (value.masterDeviceID === data.masterDeviceID && value.deviceName === 'Position') {
            let topic = "schellenberg/device/value/" + key;  // or topic /update/ ?
            var position = '0';
            if (message === this.valueMapping.get('close')) {
              position = '100';
            }
            this.logService.debug(topic + " => " + position, "MQTTController");
            this.client.publish(topic, position, options);
          }
        }
      }

      // Set current position and position state
      if (data.floatValue) {
        let topic = "schellenberg/device/value/current/" + data.deviceID;
        this.logService.debug(topic + " => " + message, "MQTTController");
        this.client.publish(topic, message, options);
        if (data.value === 0 || data.value === 100) {
          for (const [key, value] of deviceMap) {
            if (value.masterDeviceID === data.masterDeviceID && value.deviceName === 'Schalter') {
              let topic = "schellenberg/device/value/update/" + key;
              this.logService.debug(topic + " => " + this.valueMapping.get('stop'), "MQTTController");
              this.client.publish(topic, this.valueMapping.get('stop'), options);
            }
          }
        }
      }
    }
  }
}

module.exports = MQTTController;
