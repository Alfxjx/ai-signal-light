package com.aisignallight

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.ui.home.HomeScreen
import com.aisignallight.ui.scan.ScanScreen
import com.aisignallight.ui.settings.SettingsScreen
import com.aisignallight.ui.theme.AISignalLightTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var configRepository: ConfigRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val config by configRepository.observeConfig()
                .collectAsStateWithLifecycle(initialValue = AppConfig())

            AISignalLightTheme(themeMode = config.themeMode) {
                AppNavigation()
            }
        }
    }
}

@Composable
private fun AppNavigation() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "home") {
        composable("home") {
            HomeScreen(navController = navController)
        }
        composable("settings") {
            SettingsScreen(navController = navController)
        }
        composable("scan") {
            ScanScreen(navController = navController)
        }
    }
}
