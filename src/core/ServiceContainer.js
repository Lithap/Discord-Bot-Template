const logger = require('../utils/logger.js');

/**
 * Professional Dependency Injection Container
 * Manages service lifecycle and dependencies with singleton pattern
 */
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
        this.factories = new Map();
        this.isInitialized = false;
    }

    /**
     * Register a singleton service
     * @param {string} name - Service name
     * @param {Function|Object} service - Service class or instance
     * @param {Array} dependencies - Array of dependency names
     */
    registerSingleton(name, service, dependencies = []) {
        this.services.set(name, {
            type: 'singleton',
            service,
            dependencies,
            instance: null
        });
        logger.debug(`Registered singleton service: ${name}`);
    }

    /**
     * Register a transient service (new instance each time)
     * @param {string} name - Service name
     * @param {Function} service - Service class
     * @param {Array} dependencies - Array of dependency names
     */
    registerTransient(name, service, dependencies = []) {
        this.services.set(name, {
            type: 'transient',
            service,
            dependencies,
            instance: null
        });
        logger.debug(`Registered transient service: ${name}`);
    }

    /**
     * Register a factory function
     * @param {string} name - Service name
     * @param {Function} factory - Factory function
     * @param {Array} dependencies - Array of dependency names
     */
    registerFactory(name, factory, dependencies = []) {
        this.factories.set(name, { factory, dependencies });
        logger.debug(`Registered factory: ${name}`);
    }

    /**
     * Resolve a service with its dependencies
     * @param {string} name - Service name
     * @returns {Object} Service instance
     */
    resolve(name) {
        // Check if it's a factory
        if (this.factories.has(name)) {
            return this.resolveFactory(name);
        }

        const serviceConfig = this.services.get(name);
        if (!serviceConfig) {
            throw new Error(`Service '${name}' not found`);
        }

        // Return existing singleton instance
        if (serviceConfig.type === 'singleton' && serviceConfig.instance) {
            return serviceConfig.instance;
        }

        // Resolve dependencies
        const dependencies = this.resolveDependencies(serviceConfig.dependencies);

        // Create instance
        let instance;
        if (typeof serviceConfig.service === 'function') {
            instance = new serviceConfig.service(...dependencies);
        } else {
            instance = serviceConfig.service;
        }

        // Store singleton instance
        if (serviceConfig.type === 'singleton') {
            serviceConfig.instance = instance;
        }

        return instance;
    }

    /**
     * Resolve factory service
     * @param {string} name - Factory name
     * @returns {Object} Factory result
     */
    resolveFactory(name) {
        const factoryConfig = this.factories.get(name);
        const dependencies = this.resolveDependencies(factoryConfig.dependencies);
        return factoryConfig.factory(...dependencies);
    }

    /**
     * Resolve array of dependencies
     * @param {Array} dependencies - Dependency names
     * @returns {Array} Resolved dependencies
     */
    resolveDependencies(dependencies) {
        return dependencies.map(dep => this.resolve(dep));
    }

    /**
     * Check if service exists
     * @param {string} name - Service name
     * @returns {boolean}
     */
    has(name) {
        return this.services.has(name) || this.factories.has(name);
    }

    /**
     * Get all registered service names
     * @returns {Array} Service names
     */
    getServiceNames() {
        return [...this.services.keys(), ...this.factories.keys()];
    }

    /**
     * Initialize all singleton services
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        logger.info('Initializing service container...');

        // Initialize singletons in dependency order
        const singletonNames = Array.from(this.services.keys())
            .filter(name => this.services.get(name).type === 'singleton');

        for (const name of singletonNames) {
            try {
                this.resolve(name);
                logger.debug(`Initialized service: ${name}`);
            } catch (error) {
                logger.error(`Failed to initialize service '${name}':`, error);
                throw error;
            }
        }

        this.isInitialized = true;
        logger.success(`Service container initialized with ${this.services.size} services`);
    }

    /**
     * Shutdown all services
     */
    async shutdown() {
        logger.info('Shutting down service container...');

        for (const [name, config] of this.services) {
            if (config.instance && typeof config.instance.shutdown === 'function') {
                try {
                    await config.instance.shutdown();
                    logger.debug(`Shutdown service: ${name}`);
                } catch (error) {
                    logger.error(`Error shutting down service '${name}':`, error);
                }
            }
        }

        this.services.clear();
        this.singletons.clear();
        this.factories.clear();
        this.isInitialized = false;

        logger.success('Service container shutdown complete');
    }
}

module.exports = ServiceContainer;
